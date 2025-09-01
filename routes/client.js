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
            console.log(`Trying address variation: "${addr}"`);

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
                console.log(`Found location for: "${addr}"`);
                console.log('Place details:', {
                    display_name: place.display_name,
                    lat: place.lat,
                    lon: place.lon
                });

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

router.post('/', async (req, res) => {
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
});

/*router.patch('/', async (req, res) => {
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
        const location = await geocodeAddress(address);
        const point = `POINT(${location.lat} ${location.lon})`;
        await client.execute(`UPDATE client SET clientName = ?, address=?,location=ST_GeomFromText(?, 4326),updated_at=NOW() WHERE clientId=?`, [name, address, point, updatedClientDetails.id]);
        await client.commit();
        res.status(204).json({ message: "CLient Details Updated Successfully" });
    } catch (error) {
        console.error("Error Updating Client Details", error.stack);
        await client.rollback();
        res.status(500).json({ message: "Internal server error during Client updation" });
    } finally {
        client.release();
    }
});*/

router.patch('/', cors(corsOptions), async (req, res) => {
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