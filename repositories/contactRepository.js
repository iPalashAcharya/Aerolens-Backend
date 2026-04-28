const AppError = require('../utils/appError');

class ContactRepository {
    constructor(db) {
        this.db = db;
    }

    // No is_deleted filter — used as pre-check inside mutations
    async getById(contactId, client) {
        try {
            const [contactDetails] = await client.execute(
                `SELECT clientContactId, contactPersonName, designation, emailAddress, phone
                 FROM clientContact WHERE clientContactId = ?`,
                [contactId]
            );
            return contactDetails.length > 0 ? contactDetails[0] : null;
        } catch (error) {
            this._handleDatabaseError(error, 'getById');
        }
    }

    async create(contactData, client) {
        try {
            const [result] = await client.execute(
                `INSERT INTO clientContact (contactPersonName, designation, phone, emailAddress, clientId)
                 VALUES (?, ?, ?, ?, ?)`,
                [contactData.contactPersonName, contactData.designation, contactData.phone, contactData.email, contactData.clientId]
            );
            return {
                contactId: result.insertId,
                contactPersonName: contactData.contactPersonName,
                designation: contactData.designation,
                phone: contactData.phone,
                email: contactData.email
            };
        } catch (error) {
            this._handleDatabaseError(error, 'create');
        }
    }

    async update(contactId, finalUpdateData, client) {
        try {
            const [result] = await client.execute(
                `UPDATE clientContact SET contactPersonName=?, designation=?, phone=?, emailAddress=?
                 WHERE clientContactId=? AND (is_deleted = false OR is_deleted IS NULL)`,
                [finalUpdateData.contactPersonName, finalUpdateData.designation, finalUpdateData.phone, finalUpdateData.emailAddress, contactId]
            );
            if (result.affectedRows === 0) return null;
            return { contactId, ...finalUpdateData };
        } catch (error) {
            this._handleDatabaseError(error, 'update');
        }
    }

    async delete(contactId, client) {
        try {
            const [result] = await client.execute(
                `UPDATE clientContact SET is_deleted = true, deleted_at = UTC_TIMESTAMP()
                 WHERE clientContactId = ? AND (is_deleted = false OR is_deleted IS NULL)`,
                [contactId]
            );
            if (result.affectedRows === 0) return false;
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'delete');
        }
    }

    async getDeletedByClientId(clientId, client) {
        try {
            const [rows] = await client.execute(
                `SELECT clientContactId, contactPersonName, designation, emailAddress, phone, clientId,
                 DATE_FORMAT(CONVERT_TZ(deleted_at, @@session.time_zone, '+00:00'), '%Y-%m-%dT%H:%i:%s.000Z') AS deleted_at
                 FROM clientContact
                 WHERE clientId = ? AND is_deleted = true
                 ORDER BY deleted_at DESC`,
                [clientId]
            );
            return rows;
        } catch (error) {
            this._handleDatabaseError(error, 'getDeletedByClientId');
        }
    }

    async restore(contactId, client) {
        try {
            const [result] = await client.execute(
                `UPDATE clientContact SET is_deleted = false, deleted_at = NULL
                 WHERE clientContactId = ? AND is_deleted = true`,
                [contactId]
            );
            if (result.affectedRows === 0) return false;
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'restore');
        }
    }

    // No is_deleted filter — used as pre-check inside mutations
    async exists(contactId, client) {
        try {
            const [result] = await client.execute(
                `SELECT clientContactId, contactPersonName, designation, phone, emailAddress
                 FROM clientContact WHERE clientContactId = ?`,
                [contactId]
            );
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            this._handleDatabaseError(error, 'exists');
        }
    }

    async existsByName(contactPersonName, excludeId = null, client) {
        try {
            let query = `SELECT COUNT(*) as count FROM clientContact
                         WHERE contactPersonName = ? AND (is_deleted = false OR is_deleted IS NULL)`;
            const params = [contactPersonName];
            if (excludeId) { query += ` AND clientContactId != ?`; params.push(excludeId); }
            const [rows] = await client.execute(query, params);
            return rows[0].count > 0;
        } catch (error) {
            this._handleDatabaseError(error, 'existsByName');
        }
    }

    _handleDatabaseError(error, operation) {
        const errorMappings = {
            'ER_BAD_FIELD_ERROR': { status: 500, errorCode: 'DATABASE_SCHEMA_ERROR', message: 'Database schema error - invalid field reference', details: { operation } },
            'ER_NO_SUCH_TABLE': { status: 500, errorCode: 'DATABASE_SCHEMA_ERROR', message: 'Required database table not found', details: { operation } },
            'ER_ACCESS_DENIED_ERROR': { status: 500, errorCode: 'DATABASE_ACCESS_ERROR', message: 'Database access denied', details: { operation } },
            'ETIMEDOUT': { status: 503, errorCode: 'DATABASE_CONNECTION_ERROR', message: 'Database connection timeout', details: { operation } },
            'ECONNRESET': { status: 503, errorCode: 'DATABASE_CONNECTION_ERROR', message: 'Database connection timeout', details: { operation } },
            'ER_DUP_ENTRY': { status: 409, errorCode: 'DUPLICATE_ENTRY', message: 'A contact with this information already exists for the selected client', details: {} },
            'ER_DATA_TOO_LONG': { status: 400, errorCode: 'DATA_TOO_LONG', message: 'One or more fields exceed the maximum allowed length', details: { field: error.message } }
        };
        const mapping = errorMappings[error.code];
        if (mapping) throw new AppError(mapping.message, mapping.status, mapping.errorCode, mapping.details);
        throw new AppError('Database operation failed', 500, 'DATABASE_ERROR', { operation, code: error.code, sqlState: error.sqlState });
    }
}

module.exports = ContactRepository;
