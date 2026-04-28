const AppError = require('../utils/appError');

class VendorRepository {
    constructor(db) {
        this.db = db;
    }

    async getAll(client) {
        const connection = client;

        try {
            const query = `
            SELECT vendorId, vendorName, vendorPhone, vendorEmail, contactPersonName
            FROM recruitmentVendor
            WHERE (is_deleted = false OR is_deleted IS NULL)
            `;

            const [rows] = await connection.execute(query);
            return rows;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async create(vendorData, client) {
        const connection = client;

        try {
            const query = `
            INSERT INTO recruitmentVendor (vendorName, vendorEmail, vendorPhone, contactPersonName) 
            VALUES (?, ?, ?, ?)
            `;

            const [result] = await connection.execute(query, [
                vendorData.vendorName,
                vendorData.vendorEmail,
                vendorData.vendorPhone,
                vendorData.contactPersonName
            ]);

            return {
                vendorId: result.insertId,
                ...vendorData
            };
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async findById(vendorId, client) {
        const connection = client;

        try {
            const query = `
            SELECT vendorId, vendorName, vendorPhone, vendorEmail, contactPersonName
            FROM recruitmentVendor 
            WHERE vendorId = ?
              AND (is_deleted = false OR is_deleted IS NULL)
            `;

            const [rows] = await connection.execute(query, [vendorId]);
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async update(vendorId, updateData, client) {
        const connection = client;

        try {
            const allowedFields = ['vendorName', 'vendorPhone', 'vendorEmail', 'contactPersonName'];

            const sanitizedData = Object.fromEntries(
                Object.entries(updateData).filter(
                    ([key, value]) => allowedFields.includes(key) && value !== undefined
                )
            );

            const fields = Object.keys(sanitizedData);
            const values = Object.values(sanitizedData);

            if (fields.length === 0) {
                throw new AppError(
                    'No valid fields provided for update',
                    400,
                    'INVALID_UPDATE_FIELDS'
                );
            }
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `
                UPDATE recruitmentVendor
                SET ${setClause}
                WHERE vendorId = ?
                  AND (is_deleted = false OR is_deleted IS NULL)
            `;


            const [result] = await connection.execute(query, [...values, vendorId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Vendor with ID ${vendorId} not found`,
                    404,
                    'VENDOR_NOT_FOUND'
                );
            }

            return true;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async delete(vendorId, client) {
        const connection = client;

        try {
            const query = `
                UPDATE recruitmentVendor
                SET is_deleted = true,
                    deleted_at = UTC_TIMESTAMP()
                WHERE vendorId = ?
                  AND (is_deleted = false OR is_deleted IS NULL)
            `;
            const [result] = await connection.execute(query, [vendorId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Vendor with ID ${vendorId} not found`,
                    404,
                    'VENDOR_NOT_FOUND'
                );
            }

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async exists(vendorPhone, vendorEmail, excludeId, client) {
        const conditions = [];
        const params = [];

        if (vendorPhone) {
            conditions.push('vendorPhone = ?');
            params.push(vendorPhone);
        }

        if (vendorEmail) {
            conditions.push('vendorEmail = ?');
            params.push(vendorEmail);
        }

        if (conditions.length === 0) {
            return false;
        }

        let query = `
        SELECT COUNT(*) as count
        FROM recruitmentVendor
        WHERE (${conditions.join(' OR ')})
          AND (is_deleted = false OR is_deleted IS NULL)
    `;

        if (excludeId) {
            query += ` AND vendorId != ?`;
            params.push(excludeId);
        }

        const [rows] = await client.execute(query, params);
        return rows[0].count > 0;
    }

    async getDeletedVendors(client) {
        const connection = client;
        try {
            const [rows] = await connection.query(
                `SELECT
                    vendorId,
                    vendorName,
                    vendorPhone,
                    vendorEmail,
                    contactPersonName,
                    DATE_FORMAT(
                        CONVERT_TZ(deleted_at, @@session.time_zone, '+00:00'),
                        '%Y-%m-%dT%H:%i:%s.000Z'
                    ) AS deleted_at
                 FROM recruitmentVendor
                 WHERE is_deleted = true
                 ORDER BY deleted_at DESC`
            );
            return { rows };
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    _handleDatabaseError(error) {
        console.error('Database error:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            throw new AppError(
                'Vendor phone or email already exists',
                409,
                'VENDOR_DUPLICATE'
            );
        }

        if (
            error.code === 'ER_BAD_NULL_ERROR' ||
            error.code === 'ER_DATA_TOO_LONG' ||
            error.code === 'ER_TRUNCATED_WRONG_VALUE'
        ) {
            throw new AppError(
                'Invalid data provided',
                400,
                'VALIDATION_ERROR'
            );
        }

        throw new AppError(
            'Database operation failed',
            500,
            'DATABASE_ERROR'
        );
    }

    async restore(vendorId, client) {
        try {
            const [result] = await client.execute(
                `UPDATE recruitmentVendor
                 SET is_deleted = false, deleted_at = NULL
                 WHERE vendorId = ? AND is_deleted = true`,
                [vendorId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            this._handleDatabaseError(error, 'restore');
        }
    }
}

module.exports = VendorRepository;
