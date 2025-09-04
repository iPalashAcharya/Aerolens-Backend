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

router.patch('/', async (req, res) => {
    const client = await db.getConnection();
    const updatedDepartmentDetails = req.body;

    try {
        await client.beginTransaction();

        if (!updatedDepartmentDetails.departmentId) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "department ID is required for update operation",
                details: {
                    missingFields: ['departmentId']
                }
            });
        }

        if (isNaN(parseInt(updatedDepartmentDetails.departmentId))) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Invalid Department ID format",
                details: {
                    providedId: updatedDepartmentDetails.departmentId,
                    expectedFormat: "numeric"
                }
            });
        }

        if (!req.body.departmentName && !req.body.departmentDescription) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "At least one field (departmentName or departmentDescription) must be provided for update",
                details: {
                    allowedFields: ['departmentName', 'departmentDescription']
                }
            });
        }

        let departmentDetails;
        try {
            [departmentDetails] = await client.execute(
                `SELECT clientId, departmentName,departmentDescription FROM department WHERE departmentId = ?`,
                [updatedDepartmentDetails.departmentId]
            );
        } catch (dbError) {
            console.error("Database error during department lookup:", dbError);
            await client.rollback();
            return res.status(500).json({
                success: false,
                error: "DATABASE_ERROR",
                message: "Failed to retrieve department information",
                details: {
                    operation: "SELECT",
                    code: dbError.code
                }
            });
        }

        if (departmentDetails.length === 0) {
            return res.status(404).json({
                success: false,
                error: "CONTACT_NOT_FOUND",
                message: `Contact with ID ${updatedDepartmentDetails.departmentId} does not exist`,
                details: {
                    departmentId: updatedDepartmentDetails.departmentId,
                    suggestion: "Please verify the department ID and try again"
                }
            });
        }

        const existingDepartment = departmentDetails[0];
        const name = updatedDepartmentDetails.departmentName || existingDepartment.departmentName;
        const description = updatedDepartmentDetails.departmentDescription || existingDepartment.departmentDescription;

        if (name && name.length > 100) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Department name exceeds maximum allowed length",
                details: {
                    field: "departmentName",
                    maxLength: 100,
                    providedLength: name.length
                }
            });
        }

        try {
            const [result] = await client.execute(`UPDATE department SET departmentName=?,departmentDescription=? WHERE departmentId=?`, [name, description, updatedDepartmentDetails.departmentId]);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: "UPDATE_FAILED",
                    message: "No changes were made to the department record",
                    details: {
                        departmentId: updatedDepartmentDetails.departmentId,
                        reason: "department may have been deleted by another process"
                    }
                });
            }

            await client.commit();

            res.status(200).json({
                success: true,
                message: "department details updated successfully",
                data: {
                    departmentId: updatedDepartmentDetails.departmentId,
                    updatedFields: {
                        departmentName: req.body.departmentName ? req.body.departmentName : undefined,
                        departmentDescription: req.body.departmentDescription ? req.body.departmentDescription : undefined
                    },
                    previousValues: {
                        departmentName: existingDepartment.departmentName ? existingDepartment.departmentName : undefined,
                        description: existingDepartment.departmentDescription ? existingDepartment.departmentDescription : undefined
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
                    message: "A department with this information already exists",
                    details: {
                        conflictingField: dbError.message.includes('departmentName') ? 'departmentName' : 'unknown',
                        suggestion: "Please use a different department name or check for existing departments"
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
                message: "Failed to update department details",
                details: {
                    operation: "UPDATE",
                    code: dbError.code,
                    sqlState: dbError.sqlState
                }
            });
        }

    } catch (error) {
        console.error("Unexpected error during department update:", error.stack);
        try {
            await client.rollback();
        } catch (rollbackError) {
            console.error("Rollback failed:", rollbackError);
        }
        res.status(500).json({
            success: false,
            error: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred while updating department details",
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

router.delete('/:id', async (req, res) => {
    const client = await db.getConnection();
    const departmentId = parseInt(req.params.id);
    if (!departmentId) {
        res.status(400).json({ message: "Invalid Department ID" });
    }
    try {
        await client.beginTransaction();
        const [result] = await client.execute(`DELETE FROM department WHERE departmentid=?`, [departmentId]);
        if (result.affectedRows === 0) {
            await client.rollback();
            return res.status(404).json({ message: "department not found" });
        }
        await client.commit();
        res.status(200).json({ message: "department deleted successfully" });
    } catch (error) {
        console.error("Error deleting Department", error.stack);
        await client.rollback();
        res.status(500).json({ message: "Internal server error during Department deletion" });
    } finally {
        client.release();
    }
});

module.exports = router;