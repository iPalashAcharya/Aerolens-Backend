const express = require('express');
const db = require('../db');
const axios = require('axios');

const router = express.Router();

async function geocodeAddress(address) {
    const url = 'https://nominatim.openstreetmap.org/search';
    const response = await axios.get(url, {
        params: {
            q: address,
            format: 'json',
            addressdetails: 1,
            limit: 1
        }
    });
    if (response.data.length === 0) throw new Error('No results found');
    const place = response.data[0];
    return { lat: place.lat, lon: place.lon };
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
        const location = await geocodeAddress(clientDetails.address);
        const point = `POINT(${location.lon} ${location.lat})`;
        await db.execute(`INSERT INTO client(clientName,address,location,created_at,updated_at) VALUES(?,?,ST_GeomFromText(?, 4326),NOW(),NOW())`, [clientDetails.name, clientDetails.address, point]);
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

router.patch('/', async (req, res) => {
    const client = await db.getConnection();
    const updatedClientDetails = req.body;
    try {
        await client.beginTransaction();
        const [clientDetails] = await client.execute(`SELECT clientId,clientName,address,location FROM client WHERE id=?`, [updatedClientDetails.id]);
        if (clientDetails.length === 0) {
            return res.status(400).json({ message: `Client details do not exist for id ${updatedClientDetails.id}` });
        }
        const name = req.body.name || clientDetails.name;
        const address = req.body.address || clientDetails.address;

    } catch (error) {

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