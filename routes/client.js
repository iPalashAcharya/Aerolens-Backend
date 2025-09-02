const express = require('express');
const db = require('../db');
const axios = require('axios');
const { decode, isValid } = require('open-location-code');
const cors = require('cors');

const corsOptions = {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

const router = express.Router();

async function geocodeAddress(address) {
    console.log('Starting geocoding for:', address);

    // Step 1: Check for Plus Code first
    const plusCodeRegex = /([A-Z0-9]{4}\+[A-Z0-9]{2,3})/;
    const plusCodeMatch = address.match(plusCodeRegex);

    if (plusCodeMatch) {
        const plusCode = plusCodeMatch[1];
        console.log('Found Plus Code:', plusCode);

        try {
            // Validate the Plus Code
            if (isValid(plusCode)) {
                console.log('Plus Code is valid, decoding...');
                const decoded = decode(plusCode);
                console.log('Decoded Plus Code result:', decoded);

                return {
                    lat: decoded.latitudeCenter,
                    lon: decoded.longitudeCenter,
                    source: 'plus_code'
                };
            } else {
                console.log('Plus Code is invalid, falling back to regular geocoding');
            }
        } catch (error) {
            console.log('Plus Code decode failed:', error.message);
            console.log('Falling back to regular geocoding');
        }
    }

    // Step 2: Fall back to Nominatim geocoding
    return await geocodeWithNominatim(address);
}

async function geocodeWithNominatim(address) {
    const url = 'https://nominatim.openstreetmap.org/search';

    // Clean up the address for better geocoding
    let cleanAddress = address;

    // Remove Plus Code if present
    cleanAddress = cleanAddress.replace(/[A-Z0-9]{4}\+[A-Z0-9]{2,3}[,\s]*/, '').trim();

    // Remove directional references and landmarks that might confuse geocoding
    cleanAddress = cleanAddress.replace(/opp\.\s*to[^,]*,?\s*/gi, '');
    cleanAddress = cleanAddress.replace(/near[^,]*,?\s*/gi, '');
    cleanAddress = cleanAddress.replace(/opposite[^,]*,?\s*/gi, '');

    // Determine if it's an Indian address
    const isIndianAddress = /india|gujarat|maharashtra|delhi|mumbai|bangalore|chennai|kolkata|hyderabad|pune|ahmedabad/i.test(address);

    let addressVariations = [];

    if (isIndianAddress) {
        // Indian address variations
        const parts = cleanAddress.split(',').map(part => part.trim()).filter(part => part);

        addressVariations = [
            cleanAddress,
            parts.slice(-3).join(', '), // Last 3 parts (usually area, city, state)
            parts.slice(-2).join(', '), // Last 2 parts (usually city, state)
            parts.slice(-1).join(', '), // Just the last part (usually state/city)
            cleanAddress + ', India', // Add India if not present
        ];
    } else {
        // US/International address variations
        addressVariations = [
            cleanAddress,
            cleanAddress.replace(/,\s*USA$/, ''),
            cleanAddress.replace(/,.*$/, ''),
            cleanAddress.split(',').slice(0, 2).join(',')
        ];
    }

    // Remove duplicates
    addressVariations = [...new Set(addressVariations)];

    for (const addr of addressVariations) {
        if (!addr || addr.trim().length === 0) continue;

        try {

            const response = await axios.get(url, {
                params: {
                    q: addr,
                    format: 'json',
                    addressdetails: 1,
                    limit: 3,
                    countrycodes: isIndianAddress ? 'in' : undefined
                },
                headers: {
                    'User-Agent': 'Aerolens/1.0'
                },
                timeout: 15000
            });

            if (response.data && response.data.length > 0) {
                const place = response.data[0];

                return {
                    lat: parseFloat(place.lat),
                    lon: parseFloat(place.lon),
                    source: 'nominatim',
                    matched_address: place.display_name
                };
            }

            // Respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.log(`Failed variation "${addr}":`, error.message);

            // If it's a network error, wait longer before trying next variation
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    throw new Error('No results found for address: ' + address);
}

// Enhanced function that can handle multiple geocoding strategies
async function geocodeAddressWithFallback(address) {
    try {
        // First try the Plus Code/Nominatim approach
        return await geocodeAddress(address);
    } catch (error) {
        console.log('Primary geocoding failed:', error.message);

        // If everything fails, you could add more fallback methods here
        // For example, a manual coordinate lookup for known areas

        // For Ahmedabad, you could provide approximate coordinates as last resort
        if (/ahmedabad/i.test(address)) {
            console.log('Using approximate coordinates for Ahmedabad');
            return {
                lat: 23.0225,
                lon: 72.5714,
                source: 'approximate'
            };
        }

        throw error;
    }
}

router.get('/', async (req, res) => {
    const client = await db.getConnection();
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;

        const countQuery = `SELECT COUNT(clientId) as total FROM client`;
        const [countResult] = await client.query(countQuery);
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        const dataQuery = `
      SELECT clientId,clientName,address,location FROM client 
      LIMIT ? OFFSET ?
    `;
        const dataParams = [limit, offset];
        const [clients] = await client.query(dataQuery, dataParams);

        res.json({
            data: clients,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page < totalPages ? page + 1 : null,
                prevPage: page > 1 ? page - 1 : null
            }
        });
    } catch (error) {
        console.error("Error fetching Clients", error.stack);
        res.status(500).json({ message: "Internal server error during Client Fetching" });
    } finally {
        client.release();
    }
});

/*router.post('/', async (req, res) => {
    const client = await db.getConnection();
    const clientDetails = req.body;
    try {
        await client.beginTransaction();
        console.log('Client details:', clientDetails); // Debug log
        console.log('Address to geocode:', clientDetails.address);
        const location = await geocodeAddressWithFallback(clientDetails.address);
        const point = `POINT(${location.lat} ${location.lon})`;
        console.log('Geocoded location:', location);
        console.log(point);
        await client.execute(`INSERT INTO client(clientName,address,location,created_at,updated_at) VALUES(?,?,ST_GeomFromText(?, 4326),NOW(),NOW())`, [clientDetails.name, clientDetails.address, point]);
        await client.commit();
        res.status(201).json({ message: "client details posted successfully" });
    } catch (error) {
        console.error("Error posting Client", error.stack);
        await client.rollback();
        res.status(500).json({ message: "Internal server error during Client posting" });
    } finally {
        client.release();
    }
});*/

router.post('/', async (req, res) => {
    const client = await db.getConnection();
    const clientDetails = req.body;
    try {
        await client.beginTransaction();
        if (!clientDetails.name || !clientDetails.address) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Name and address are required fields",
                details: {
                    missingFields: [
                        ...(!clientDetails.name ? ['name'] : []),
                        ...(!clientDetails.address ? ['address'] : [])
                    ]
                }
            });
        }

        let location;
        try {
            location = await geocodeAddressWithFallback(clientDetails.address);
            console.log('Geocoded location:', location);
        } catch (geocodeError) {
            console.error('Geocoding failed:', geocodeError.message);
            return res.status(422).json({
                success: false,
                error: "GEOCODING_ERROR",
                message: "Unable to find location for the provided address",
                details: {
                    address: clientDetails.address,
                    geocodeError: geocodeError.message,
                    suggestion: "Please verify the address format and try again"
                }
            });
        }

        const point = `POINT(${location.lat} ${location.lon})`;
        try {
            await client.execute(
                `INSERT INTO client(clientName, address, location, created_at, updated_at) 
                 VALUES(?, ?, ST_GeomFromText(?, 4326), NOW(), NOW())`,
                [clientDetails.name, clientDetails.address, point]
            );

            await client.commit();

            res.status(201).json({
                success: true,
                message: "Client details posted successfully",
                data: {
                    clientName: clientDetails.name,
                    address: clientDetails.address,
                    location: {
                        lat: location.lat,
                        lon: location.lon,
                        source: location.source
                    }
                }
            });

        } catch (dbError) {
            console.error("Database error:", dbError);
            await client.rollback();

            if (dbError.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    error: "DUPLICATE_ENTRY",
                    message: "A client with this information already exists",
                    details: {
                        duplicateField: dbError.message.includes('clientName') ? 'name' : 'unknown'
                    }
                });
            }

            if (dbError.code === 'ER_DATA_TOO_LONG') {
                return res.status(400).json({
                    success: false,
                    error: "DATA_TOO_LONG",
                    message: "One or more fields exceed the maximum allowed length",
                    details: {
                        field: dbError.message
                    }
                });
            }

            return res.status(500).json({
                success: false,
                error: "DATABASE_ERROR",
                message: "Database operation failed",
                details: {
                    code: dbError.code,
                    sqlState: dbError.sqlState
                }
            });
        }

    } catch (error) {
        console.error("Unexpected error:", error.stack);

        try {
            await client.rollback();
        } catch (rollbackError) {
            console.error("Rollback failed:", rollbackError);
        }

        res.status(500).json({
            success: false,
            error: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred while processing your request",
            details: {
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });

    } finally {
        try {
            client.release();
        } catch (releaseError) {
            console.error("Error releasing database connection:", releaseError);
        }
    }
});

router.patch('/', cors(corsOptions), async (req, res) => {
    const client = await db.getConnection();
    const updatedClientDetails = req.body;

    try {
        await client.beginTransaction();

        if (!updatedClientDetails.id) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Client ID is required for update operation",
                details: {
                    missingFields: ['id']
                }
            });
        }

        if (isNaN(parseInt(updatedClientDetails.id))) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Invalid client ID format",
                details: {
                    providedId: updatedClientDetails.id,
                    expectedFormat: "numeric"
                }
            });
        }

        if (!req.body.name && !req.body.address) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "At least one field (name or address) must be provided for update",
                details: {
                    allowedFields: ['name', 'address']
                }
            });
        }

        let clientDetails;
        try {
            [clientDetails] = await client.execute(
                `SELECT clientId, clientName, address, location FROM client WHERE clientId = ?`,
                [updatedClientDetails.id]
            );
        } catch (dbError) {
            console.error("Database error during client lookup:", dbError);
            await client.rollback();
            return res.status(500).json({
                success: false,
                error: "DATABASE_ERROR",
                message: "Failed to retrieve client information",
                details: {
                    operation: "SELECT",
                    code: dbError.code
                }
            });
        }

        if (clientDetails.length === 0) {
            return res.status(404).json({
                success: false,
                error: "CLIENT_NOT_FOUND",
                message: `Client with ID ${updatedClientDetails.id} does not exist`,
                details: {
                    clientId: updatedClientDetails.id,
                    suggestion: "Please verify the client ID and try again"
                }
            });
        }

        const existingClient = clientDetails[0];
        const name = req.body.name || existingClient.clientName;
        const address = req.body.address || existingClient.address;

        if (name && name.length > 255) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Client name exceeds maximum allowed length",
                details: {
                    field: "name",
                    maxLength: 255,
                    providedLength: name.length
                }
            });
        }

        if (address && address.length > 500) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Address exceeds maximum allowed length",
                details: {
                    field: "address",
                    maxLength: 500,
                    providedLength: address.length
                }
            });
        }

        let updateQuery, updateParams, location = null;

        if (req.body.address && req.body.address !== existingClient.address) {
            console.log('Address changed, geocoding new address:', req.body.address);

            try {
                location = await geocodeAddressWithFallback(address);
                console.log('Geocoded location:', location);

                const point = `POINT(${location.lat} ${location.lon})`;
                updateQuery = `UPDATE client SET clientName = ?, address = ?, location = ST_GeomFromText(?, 4326), updated_at = NOW() WHERE clientId = ?`;
                updateParams = [name, address, point, updatedClientDetails.id];

            } catch (geocodeError) {
                console.error('Geocoding failed for updated address:', geocodeError.message);
                return res.status(422).json({
                    success: false,
                    error: "GEOCODING_ERROR",
                    message: "Unable to find location for the new address",
                    details: {
                        newAddress: address,
                        oldAddress: existingClient.address,
                        geocodeError: geocodeError.message,
                        suggestion: "Please verify the new address format or keep the existing address"
                    }
                });
            }
        } else {
            console.log('Address unchanged, keeping existing location');
            updateQuery = `UPDATE client SET clientName = ?, address = ?, updated_at = NOW() WHERE clientId = ?`;
            updateParams = [name, address, updatedClientDetails.id];
        }

        try {
            const [result] = await client.execute(updateQuery, updateParams);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: "UPDATE_FAILED",
                    message: "No changes were made to the client record",
                    details: {
                        clientId: updatedClientDetails.id,
                        reason: "Client may have been deleted by another process"
                    }
                });
            }

            await client.commit();

            res.status(200).json({
                success: true,
                message: "Client details updated successfully",
                data: {
                    clientId: updatedClientDetails.id,
                    updatedFields: {
                        name: req.body.name ? name : undefined,
                        address: req.body.address ? address : undefined,
                        ...(location && {
                            location: {
                                lat: location.lat,
                                lon: location.lon,
                                source: location.source
                            }
                        })
                    },
                    previousValues: {
                        name: existingClient.clientName,
                        address: existingClient.address
                    }
                }
            });

        } catch (dbError) {
            console.error("Database error during update:", dbError);
            await client.rollback();

            if (dbError.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    error: "DUPLICATE_ENTRY",
                    message: "A client with this information already exists",
                    details: {
                        conflictingField: dbError.message.includes('clientName') ? 'name' : 'unknown',
                        suggestion: "Please use a different name or check for existing clients"
                    }
                });
            }

            if (dbError.code === 'ER_DATA_TOO_LONG') {
                return res.status(400).json({
                    success: false,
                    error: "DATA_TOO_LONG",
                    message: "One or more fields exceed the maximum allowed length",
                    details: {
                        error: dbError.message
                    }
                });
            }

            if (dbError.code === 'ER_BAD_NULL_ERROR') {
                return res.status(400).json({
                    success: false,
                    error: "NULL_CONSTRAINT_VIOLATION",
                    message: "Required field cannot be null",
                    details: {
                        field: dbError.message
                    }
                });
            }

            return res.status(500).json({
                success: false,
                error: "DATABASE_ERROR",
                message: "Failed to update client details",
                details: {
                    operation: "UPDATE",
                    code: dbError.code,
                    sqlState: dbError.sqlState
                }
            });
        }

    } catch (error) {
        console.error("Unexpected error during client update:", error.stack);
        try {
            await client.rollback();
        } catch (rollbackError) {
            console.error("Rollback failed:", rollbackError);
        }
        res.status(500).json({
            success: false,
            error: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred while updating client details",
            details: {
                timestamp: new Date().toISOString(),
                clientId: updatedClientDetails.id,
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
    } finally {
        try {
            client.release();
        } catch (releaseError) {
            console.error("Error releasing database connection:", releaseError);
        }
    }
});

/*router.patch('/', cors(corsOptions), async (req, res) => {
    const client = await db.getConnection();
    const updatedClientDetails = req.body;

    try {
        await client.beginTransaction();

        const [clientDetails] = await client.execute(`SELECT clientId,clientName,address,location FROM client WHERE clientId=?`, [updatedClientDetails.id]);

        if (clientDetails.length === 0) {
            return res.status(400).json({ message: `Client details do not exist for id ${updatedClientDetails.id}` });
        }

        const existingClient = clientDetails[0];
        const name = req.body.name || existingClient.clientName;
        const address = req.body.address || existingClient.address;

        let updateQuery, updateParams;

        if (req.body.address && req.body.address !== existingClient.address) {
            console.log('Address changed, geocoding new address:', req.body.address);
            const location = await geocodeAddressWithFallback(address);
            const point = `POINT(${location.lat} ${location.lon})`;

            updateQuery = `UPDATE client SET clientName = ?, address = ?, location = ST_GeomFromText(?, 4326), updated_at = NOW() WHERE clientId = ?`;
            updateParams = [name, address, point, updatedClientDetails.id];
        } else {
            console.log('Address unchanged, keeping existing location');
            updateQuery = `UPDATE client SET clientName = ?, address = ?, updated_at = NOW() WHERE clientId = ?`;
            updateParams = [name, address, updatedClientDetails.id];
        }

        await client.execute(updateQuery, updateParams);
        await client.commit();
        res.status(200).json({ message: "Client Details Updated Successfully" });

    } catch (error) {
        console.error("Error Updating Client Details", error.stack);
        await client.rollback();
        res.status(500).json({ message: "Internal server error during Client updation" });
    } finally {
        client.release();
    }
});*/

router.delete('/:id', async (req, res) => {
    const client = await db.getConnection();
    const clientId = parseInt(req.params.id);
    if (!clientId) {
        res.status(400).json({ message: "Invalid Client ID" });
    }
    try {
        await client.beginTransaction();
        const [result] = await client.execute(`DELETE FROM client WHERE clientId=?`, [clientId]);
        if (result.affectedRows === 0) {
            await client.rollback();
            return res.status(404).json({ message: "Client not found" });
        }
        await client.commit();
        res.status(200).json({ message: "Client details deleted successfully" });
    } catch (error) {
        console.error("Error deleting Client details", error.stack);
        await client.rollback();
        res.status(500).json({ message: "Internal server error during Client deletion" });
    } finally {
        client.release();
    }
});

module.exports = router;