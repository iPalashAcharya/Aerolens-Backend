const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/', async (req, res) => {
    const client = await db.getConnection();
    const contactDetails = req.body;
    try {
        await client.beginTransaction();
        if (!contactDetails.clientId || !contactDetails.contactPersonName || !contactDetails.designation || !contactDetails.phone || !contactDetails.email) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "contactPersonName, designation, phone, email and clientId are required fields",
                details: {
                    missingFields: [
                        ...(!contactDetails.clientId ? ['clientId'] : []),
                        ...(!contactDetails.contactPersonName ? ['contactPersonName'] : []),
                        ...(!contactDetails.designation ? ['designation'] : []),
                        ...(!contactDetails.phone ? ['phone'] : []),
                        ...(!contactDetails.email ? ['email'] : [])
                    ]
                }
            });
        }
        try {
            await client.execute(`INSERT INTO clientContact(contactPersonName,designation,phone,emailAddress,clientId) VALUES(?,?,?,?,?)`, [contactDetails.contactPersonName, contactDetails.designation, contactDetails.phone, contactDetails.email, contactDetails.clientId]);
            await client.commit();
            res.status(201).json({
                success: true,
                message: "client contact details posted successfully",
                data: {
                    contactPersonName: contactDetails.contactPersonName,
                    designation: contactDetails.designation,
                    phone: contactDetails.phone,
                    email: contactDetails.email,
                    clientId: contactDetails.clientId
                }
            });
        } catch (dbError) {
            console.error("Database error:", dbError);
            await client.rollback();

            if (dbError.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    error: "DUPLICATE_ENTRY",
                    message: "A client contact with this information already exists",
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
    const updatedContactDetails = req.body;

    try {
        await client.beginTransaction();

        if (!updatedContactDetails.contactId) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "contact ID is required for update operation",
                details: {
                    missingFields: ['contactId']
                }
            });
        }

        if (isNaN(parseInt(updatedContactDetails.contactId))) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Invalid contact ID format",
                details: {
                    providedId: updatedContactDetails.contactId,
                    expectedFormat: "numeric"
                }
            });
        }

        if (!req.body.contactPersonName && !req.body.designation && !req.body.phone && !req.body.email) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "At least one field (contactPersonName, designation, phone, or email) must be provided for update",
                details: {
                    allowedFields: ['contactPersonName', 'designation', 'phone', 'email']
                }
            });
        }

        let contactDetails;
        try {
            [contactDetails] = await client.execute(
                `SELECT clientId, contactPersonName,designation, phone,emailAddress FROM clientContact WHERE clientContactId = ?`,
                [updatedContactDetails.contactId]
            );
        } catch (dbError) {
            console.error("Database error during client lookup:", dbError);
            await client.rollback();
            return res.status(500).json({
                success: false,
                error: "DATABASE_ERROR",
                message: "Failed to retrieve contact information",
                details: {
                    operation: "SELECT",
                    code: dbError.code
                }
            });
        }

        if (contactDetails.length === 0) {
            return res.status(404).json({
                success: false,
                error: "CONTACT_NOT_FOUND",
                message: `Contact with ID ${updatedContactDetails.contactId} does not exist`,
                details: {
                    clientId: updatedContactDetails.contactId,
                    suggestion: "Please verify the contact ID and try again"
                }
            });
        }

        const existingContact = contactDetails[0];
        const name = updatedContactDetails.contactPersonName || existingContact.contactPersonName;
        const designation = updatedContactDetails.designation || existingContact.designation;
        const phone = updatedContactDetails.phone || existingContact.phone;
        const email = updatedContactDetails.email || existingContact.emailAddress;

        if (name && name.length > 100) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Contact name exceeds maximum allowed length",
                details: {
                    field: "contactPersonName",
                    maxLength: 100,
                    providedLength: name.length
                }
            });
        }

        if (designation && designation.length > 100) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Designation exceeds maximum allowed length",
                details: {
                    field: "designation",
                    maxLength: 100,
                    providedLength: designation.length
                }
            });
        }

        if (phone && phone.length > 25) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Phone exceeds maximum allowed length",
                details: {
                    field: "phone",
                    maxLength: 25,
                    providedLength: phone.length
                }
            });
        }
        if (email && email.length > 255) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Email exceeds maximum allowed length",
                details: {
                    field: "emailAddress",
                    maxLength: 255,
                    providedLength: email.length
                }
            });
        }

        try {
            const [result] = await client.execute(`UPDATE clientContact SET contactPersonName=?,designation=?,phone=?,emailAddress=? WHERE clientContactId=?`, [name, designation, phone, email, updatedContactDetails.contactId]);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: "UPDATE_FAILED",
                    message: "No changes were made to the clientContact record",
                    details: {
                        clientId: updatedContactDetails.contactId,
                        reason: "clientContact may have been deleted by another process"
                    }
                });
            }

            await client.commit();

            res.status(200).json({
                success: true,
                message: "clientContact details updated successfully",
                data: {
                    clientId: updatedContactDetails.contactId,
                    updatedFields: {
                        name: req.body.contactPersonName ? name : undefined,
                        designation: req.body.designation ? designation : undefined,
                        phone: req.body.phone ? phone : undefined,
                        email: req.body.email ? email : undefined
                    },
                    previousValues: {
                        contactPersonName: req.body.contactPersonName ? existingContact.contactPersonName : undefined,
                        designation: req.body.designation ? existingContact.designation : undefined,
                        phone: req.body.phone ? existingContact.phone : undefined,
                        email: req.body.email ? existingContact.emailAddress : undefined
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
                    message: "A clientContact with this information already exists",
                    details: {
                        conflictingField: dbError.message.includes('contactPersonName') ? 'contactPersonName' : 'unknown',
                        suggestion: "Please use a different name or check for existing client contacts"
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
                message: "Failed to update client contact details",
                details: {
                    operation: "UPDATE",
                    code: dbError.code,
                    sqlState: dbError.sqlState
                }
            });
        }

    } catch (error) {
        console.error("Unexpected error during client contact update:", error.stack);
        try {
            await client.rollback();
        } catch (rollbackError) {
            console.error("Rollback failed:", rollbackError);
        }
        res.status(500).json({
            success: false,
            error: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred while updating client contact details",
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
    const contactId = parseInt(req.params.id);
    if (!contactId) {
        res.status(400).json({ message: "Invalid Contact Person ID" });
    }
    try {
        await client.beginTransaction();
        const [result] = await client.execute(`DELETE FROM clientContact WHERE clientContactId=?`, [contactId]);
        if (result.affectedRows === 0) {
            await client.rollback();
            return res.status(404).json({ message: "client contact not found" });
        }
        await client.commit();
        res.status(200).json({ message: "client contact deleted successfully" });
    } catch (error) {
        console.error("Error deleting Department", error.stack);
        await client.rollback();
        res.status(500).json({ message: "Internal server error during client contact deletion" });
    } finally {
        client.release();
    }
});


module.exports = router;