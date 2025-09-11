const express = require('express');
const db = require('../db');
const axios = require('axios');
const OpenLocationCode = require('open-location-code').OpenLocationCode;
const olc = new OpenLocationCode();
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
    const plusCodeRegex = /[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/
    const plusCodeMatch = address.match(plusCodeRegex);

    if (plusCodeMatch) {
        const plusCode = plusCodeMatch[0].toUpperCase();
        console.log('Found Plus Code:', plusCode);

        try {
            if (!olc.isValid(plusCode)) {
                console.log('Not a valid Open Location Code; falling back to normal geocode');
                return await geocodeWithNominatim(address);
            }

            if (olc.isFull(plusCode)) {
                console.log('Full OLC detected, decoding...');
                const area = olc.decode(plusCode); // has latitudeCenter, longitudeCenter, lat/long lo/hi
                return {
                    lat: area.latitudeCenter,
                    lon: area.longitudeCenter,
                    source: 'plus_code'
                };
            }
            if (olc.isShort(plusCode)) {
                console.log('Short OLC detected. Attempting to recover full code using locality from address...');

                // Try to extract the locality text by removing the plus-code from the address
                const localityText = address.replace(plusCodeRegex, '').trim()
                    .replace(/^[,;\-]+|[,;\-]+$/g, '').trim();

                let ref = null;
                if (localityText) {
                    console.log('Geocoding locality to get reference coords:', localityText);
                    // geocodeWithNominatim should return { lat, lon } (your existing function)
                    ref = await geocodeWithNominatim(localityText).catch(e => {
                        console.log('Locality geocode failed:', e && e.message);
                        return null;
                    });
                }
                if (!ref) {
                    console.log('No usable reference location for short code; falling back to regular geocoding of whole address');
                    return await geocodeWithNominatim(address);
                }

                // Recover the nearest full code and decode it
                const fullCode = olc.recoverNearest(plusCode, ref.lat, ref.lon);
                console.log('Recovered full code:', fullCode);
                const area = olc.decode(fullCode);
                return {
                    lat: area.latitudeCenter,
                    lon: area.longitudeCenter,
                    source: 'plus_code'
                };
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
    cleanAddress = cleanAddress.replace(/[A-Z0-9]{4}\+[A-Z0-9]{2,3}[,\s]*/, '').trim(); //removes plus code and trailing comma and space if present

    // Remove directional references and landmarks 
    cleanAddress = cleanAddress.replace(/opp\.\s*to[^,]*,?\s*/gi, ''); //deletes opp. to upto the next comma or space
    cleanAddress = cleanAddress.replace(/near[^,]*,?\s*/gi, '');
    cleanAddress = cleanAddress.replace(/opposite[^,]*,?\s*/gi, '');

    // Determine if it's an Indian address
    const isIndianAddress = /india|gujarat|maharashtra|delhi|mumbai|bangalore|chennai|kolkata|hyderabad|pune|ahmedabad/i.test(address);

    let addressVariations = [];

    if (isIndianAddress) {
        // Indian address variations
        const parts = cleanAddress.split(',').map(part => part.trim()).filter(part => part); //splits into an array on comma, trims white space and filters to ensure no empty strings

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
            cleanAddress.replace(/,.*$/, ''), //first part before the first comma
            cleanAddress.split(',').slice(0, 2).join(',') //first two parts
        ];
    }

    // Remove duplicates and empty elements
    addressVariations = [...new Set(addressVariations)].filter((addr) => addr && addr.length > 0);
    // Try first 3 variations in parallel for speed
    const geocodingPromises = addressVariations.slice(0, 3).map(async (addr, index) => {
        try {
            // Small staggered delay to avoid rate limits
            if (index > 0) {
                await new Promise(resolve => setTimeout(resolve, index * 200));
            }

            console.log(`Trying address variation: "${addr}"`);

            const response = await axios.get(url, {
                params: {
                    q: addr,
                    format: 'json',
                    addressdetails: 1,
                    limit: 1,
                    countrycodes: isIndianAddress ? 'in' : undefined
                },
                headers: {
                    'User-Agent': 'Aerolens/1.0'
                },
                timeout: 8000
            });

            if (response.data && response.data.length > 0) {
                const place = response.data[0];
                console.log(`Found location for: "${addr}"`);

                return {
                    lat: parseFloat(place.lat),
                    lon: parseFloat(place.lon),
                    source: 'nominatim',
                    matched_address: place.display_name,
                    variation_used: addr
                };
            }

            throw new Error(`No results for: ${addr}`);

        } catch (error) {
            console.log(`Failed variation "${addr}":`, error.message);
            throw error;
        }
    });

    // Wait for first successful result
    const results = await Promise.allSettled(geocodingPromises);

    // Return the first successful result
    for (const result of results) {
        if (result.status === 'fulfilled') {
            return result.value;
        }
    }

    // If all parallel attempts failed, try remaining variations sequentially
    console.log('All parallel attempts failed, trying sequential fallback');

    for (const addr of addressVariations.slice(3)) {
        if (!addr || addr.trim().length === 0) continue;

        try {
            console.log(`Sequential fallback for: "${addr}"`);
            const response = await axios.get(url, {
                params: {
                    q: addr,
                    format: 'json',
                    addressdetails: 1,
                    limit: 1,
                    countrycodes: isIndianAddress ? 'in' : undefined
                },
                headers: {
                    'User-Agent': 'Aerolens/1.0'
                },
                timeout: 5000
            });

            if (response.data && response.data.length > 0) {
                const place = response.data[0];

                return {
                    lat: parseFloat(place.lat),
                    lon: parseFloat(place.lon),
                    source: 'nominatim',
                    matched_address: place.display_name //nominatim's human readable adddress that was returned
                };
            }

            // Respect rate limits
            //await new Promise(resolve => setTimeout(resolve, 1000)); //marking promise as finished(resolved) after 1 sec
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
        const cityFallbacks = {
            'ahmedabad': { lat: 23.0225, lon: 72.5714 },
            'mumbai': { lat: 19.0760, lon: 72.8777 },
            'delhi': { lat: 28.6139, lon: 77.2090 },
            'bangalore': { lat: 12.9716, lon: 77.5946 },
            'chennai': { lat: 13.0827, lon: 80.2707 },
            'kolkata': { lat: 22.5726, lon: 88.3639 },
            'hyderabad': { lat: 17.3850, lon: 78.4867 },
            'pune': { lat: 18.5204, lon: 73.8567 }
        };

        for (const [city, coords] of Object.entries(cityFallbacks)) {
            if (address.toLowerCase().includes(city)) {
                console.log(`Using approximate coordinates for ${city}`);
                return {
                    ...coords,
                    source: 'approximate'
                };
            }
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

router.get('/:id', async (req, res) => {
    const client = await db.getConnection();
    const clientId = req.params.id;
    try {
        if (!clientId) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Client ID is required",
                details: {
                    parameter: "id",
                    location: "path"
                }
            });
        }

        if (isNaN(parseInt(clientId))) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Invalid client ID format",
                details: {
                    providedId: clientId,
                    expectedFormat: "numeric",
                    example: "/api/client/123"
                }
            });
        }
        let clientDetails;
        try {
            [clientDetails] = await client.execute(`SELECT 
            c.clientId,
            c.clientName,
            c.address,
            c.location,
            COALESCE(d.departments, JSON_ARRAY()) AS departments,
            COALESCE(con.contacts, JSON_ARRAY()) AS clientContact
            FROM 
            client c
            LEFT JOIN (
            SELECT clientId, JSON_ARRAYAGG(
                JSON_OBJECT('departmentId', departmentId, 'departmentName', departmentName, 'departmentDescription', departmentDescription)
            ) AS departments
            FROM department
            GROUP BY clientId
            ) d ON c.clientId = d.clientId
            LEFT JOIN (
            SELECT clientId, JSON_ARRAYAGG(
                JSON_OBJECT('clientContactId', clientContactId, 'contactPersonName', contactPersonName, 'designation', designation, 'phone', phone, 'email', emailAddress)
            ) AS contacts
            FROM clientContact
            GROUP BY clientId
            ) con ON c.clientId = con.clientId
            WHERE 
            c.clientId = ?;
            `, [clientId]);
        } catch (dbError) {
            console.error("Database error during client lookup:", dbError);

            if (dbError.code === 'ER_BAD_FIELD_ERROR') {
                return res.status(500).json({
                    success: false,
                    error: "DATABASE_SCHEMA_ERROR",
                    message: "Database schema error - invalid field reference",
                    details: {
                        operation: "SELECT",
                        hint: "Database schema may have changed"
                    }
                });
            }

            if (dbError.code === 'ER_NO_SUCH_TABLE') {
                return res.status(500).json({
                    success: false,
                    error: "DATABASE_SCHEMA_ERROR",
                    message: "Required database table not found",
                    details: {
                        operation: "SELECT",
                        hint: "Database migration may be required"
                    }
                });
            }

            if (dbError.code === 'ER_ACCESS_DENIED_ERROR') {
                return res.status(500).json({
                    success: false,
                    error: "DATABASE_ACCESS_ERROR",
                    message: "Database access denied",
                    details: {
                        operation: "SELECT",
                        hint: "Check database permissions"
                    }
                });
            }

            if (dbError.code === 'ETIMEDOUT' || dbError.code === 'ECONNRESET') {
                return res.status(503).json({
                    success: false,
                    error: "DATABASE_CONNECTION_ERROR",
                    message: "Database connection timeout",
                    details: {
                        operation: "SELECT",
                        suggestion: "Please try again in a moment"
                    }
                });
            }

            return res.status(500).json({
                success: false,
                error: "DATABASE_ERROR",
                message: "Failed to retrieve client information",
                details: {
                    operation: "SELECT",
                    code: dbError.code,
                    sqlState: dbError.sqlState
                }
            });
        }
        if (!clientDetails || clientDetails.length === 0) {
            return res.status(404).json({
                success: false,
                error: "CLIENT_NOT_FOUND",
                message: `Client with ID ${clientId} not found`,
                details: {
                    clientId: clientId,
                    suggestion: "Please verify the client ID and try again",
                    searchHint: "You can search for clients using the list endpoint"
                }
            });
        }
        const clientData = clientDetails[0];
        try {
            let departments = [];
            if (clientData.departments) {
                if (typeof clientData.departments === 'string') {
                    departments = JSON.parse(clientData.departments).filter(dept => dept !== null);
                } else if (typeof clientData.departments === 'object') {
                    departments = clientData.departments.filter(dept => dept !== null);
                }
            }

            let clientContacts = [];
            if (clientData.clientContact) {
                if (typeof clientData.clientContact === 'string') {
                    clientContacts = JSON.parse(clientData.clientContact).filter(contact => contact !== null);
                } else if (typeof clientData.clientContact === 'object') {
                    clientContacts = clientData.clientContact.filter(contact => contact !== null);
                }
            }

            let locationData = null;
            if (clientData.location) {
                try {
                    locationData = {
                        type: "Point",
                        coordinates: clientData.location
                    };
                } catch (locationError) {
                    console.warn("Warning: Could not parse location data:", locationError);
                    locationData = clientData.location;
                }
            }

            const responseData = {
                success: true,
                data: {
                    clientId: clientData.clientId,
                    clientName: clientData.clientName,
                    address: clientData.address,
                    location: locationData,
                    departments: departments,
                    clientContacts: clientContacts,
                    meta: {
                        departmentCount: departments.length,
                        contactCount: clientContacts.length,
                        retrievedAt: new Date().toISOString()
                    }
                }
            };
            res.json(responseData);
        } catch (dataProcessingError) {
            console.error("Error processing client data:", dataProcessingError);
            return res.status(500).json({
                success: false,
                error: "DATA_PROCESSING_ERROR",
                message: "Failed to process client data",
                details: {
                    clientId: clientId,
                    stage: "response_formatting",
                    error: dataProcessingError.message
                }
            });
        }
    } catch (error) {
        console.error("Unexpected error during client retrieval:", error.stack);

        res.status(500).json({
            success: false,
            error: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred while retrieving client details",
            details: {
                timestamp: new Date().toISOString(),
                clientId: clientId,
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
                `INSERT INTO client(clientName, address, location, createdAt, updatedAt) 
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

router.patch('/:id', cors(corsOptions), async (req, res) => {
    const client = await db.getConnection();
    const updatedClientDetails = req.body;

    try {
        await client.beginTransaction();

        if (!req.params.id) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Client ID is required for update operation",
                details: {
                    missingFields: ['id']
                }
            });
        }

        if (isNaN(parseInt(req.params.id))) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Invalid client ID format",
                details: {
                    providedId: req.params.id,
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
                [req.params.id]
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
                message: `Client with ID ${req.params.id} does not exist`,
                details: {
                    clientId: req.params.id,
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
                updateQuery = `UPDATE client SET clientName = ?, address = ?, location = ST_GeomFromText(?, 4326), updatedAt = NOW() WHERE clientId = ?`;
                updateParams = [name, address, point, req.params.id];

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
            updateQuery = `UPDATE client SET clientName = ?, address = ?, updatedAt = NOW() WHERE clientId = ?`;
            updateParams = [name, address, req.params.id];
        }

        try {
            const [result] = await client.execute(updateQuery, updateParams);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: "UPDATE_FAILED",
                    message: "No changes were made to the client record",
                    details: {
                        clientId: req.params.id,
                        reason: "Client may have been deleted by another process"
                    }
                });
            }

            await client.commit();

            res.status(200).json({
                success: true,
                message: "Client details updated successfully",
                data: {
                    clientId: req.params.id,
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
                clientId: req.params.id,
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