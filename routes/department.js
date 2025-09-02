const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/', async (req, res) => {
    const client = await db.getConnection();
    const departmentDetails = req.body;
    try {
        await client.beginTransaction();
        if (!departmentDetails.clientId || !departmentDetails.departmentName || !departmentDetails.departmentDescription) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "departmentName, departmentDescription and clientId are required fields",
                details: {
                    missingFields: [
                        ...(!departmentDetails.clientId ? ['clientId'] : []),
                        ...(!departmentDetails.departmentName ? ['departmentName'] : []),
                        ...(!departmentDetails.departmentDescription ? ['departmentDescription'] : [])
                    ]
                }
            });
        }
        try {
            await client.execute(`INSERT INTO department(departmentName,departmentDescription,clientId) VALUES(?,?,?)`, [departmentDetails.departmentName, departmentDetails.departmentDescription, departmentDetails.clientId]);
            await client.commit();
            res.status(201).json({
                success: true,
                message: "Department details posted successfully",
                data: {
                    departmentName: departmentDetails.departmentName,
                    departmentDescription: departmentDetails.departmentDescription,
                    clientId: departmentDetails.clientId
                }
            });
        } catch (dbError) {
            console.error("Database error:", dbError);
            await client.rollback();

            if (dbError.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    error: "DUPLICATE_ENTRY",
                    message: "A department with this information already exists",
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

module.exports = router;