const AppError = require('../utils/appError');

class DepartmentRepository {
    constructor(db) {
        this.db = db;
    }

    async create(departmentData, client = null) {
        const connection = client || await this.db.getConnection(); //use the client passed if passed ie in case of transaction ie db.beginTransaction or create a new one

        try {
            const query = `
            INSERT INTO department (departmentName, departmentDescription, clientId) 
            VALUES (?, ?, ?)
            `;

            const [result] = await connection.execute(query, [
                departmentData.departmentName,
                departmentData.departmentDescription,
                departmentData.clientId
            ]);

            return {
                departmentId: result.insertId,
                ...departmentData
            };
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async findById(departmentId, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            const query = `
            SELECT departmentId, departmentName, departmentDescription, clientId, 
            createdAt, updatedAt 
            FROM department 
            WHERE departmentId = ?
            `;

            const [rows] = await connection.execute(query, [departmentId]);
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release(); //release the client only if this function is not part of a transaction
        }
    }

    async update(departmentId, updateData, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            const fields = Object.keys(updateData);
            const values = Object.values(updateData);

            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `UPDATE department SET ${setClause} WHERE departmentId = ?`;

            const [result] = await connection.execute(query, [...values, departmentId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Department with ID ${departmentId} not found`,
                    404,
                    'DEPARTMENT_NOT_FOUND'
                );
            }

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async delete(departmentId, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            const query = `DELETE FROM department WHERE departmentId = ?`;
            const [result] = await connection.execute(query, [departmentId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Department with ID ${departmentId} not found`,
                    404,
                    'DEPARTMENT_NOT_FOUND'
                );
            }

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) throw error; //if the error is a department not found error then throw it as is
            this._handleDatabaseError(error); //otherwise its a raw sql error so let the error handler defined below handle it
        } finally {
            if (!client) connection.release();
        }
    }

    async findByClientId(clientId, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            const query = `
            SELECT departmentId, departmentName, departmentDescription, clientId,
            createdAt, updatedAt 
            FROM department 
            WHERE clientId = ? 
            ORDER BY departmentName
            `;

            const [rows] = await connection.execute(query, [clientId]);
            return rows;
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async existsByName(departmentName, clientId, excludeId = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            let query = `
            SELECT COUNT(*) as count 
            FROM department 
            WHERE departmentName = ? AND clientId = ?
            `;
            const params = [departmentName, clientId];

            if (excludeId) {
                query += ` AND departmentId != ?`;
                params.push(excludeId);
            }

            const [rows] = await connection.execute(query, params);
            return rows[0].count > 0;
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    _handleDatabaseError(error) {
        console.error('Database error:', error);

        switch (error.code) {
            case 'ER_DUP_ENTRY':
                throw new AppError(
                    'A department with this name already exists for this client',
                    409,
                    'DUPLICATE_ENTRY',
                    { field: 'departmentName' }
                );

            case 'ER_DATA_TOO_LONG':
                throw new AppError(
                    'One or more fields exceed the maximum allowed length',
                    400,
                    'DATA_TOO_LONG',
                    { originalError: error.message }
                );

            case 'ER_BAD_NULL_ERROR':
                throw new AppError(
                    'Required field cannot be null',
                    400,
                    'NULL_CONSTRAINT_VIOLATION',
                    { originalError: error.message }
                );

            case 'ER_NO_REFERENCED_ROW_2':
                throw new AppError(
                    'Invalid client ID provided',
                    400,
                    'FOREIGN_KEY_CONSTRAINT',
                    { field: 'clientId' }
                );

            default:
                throw new AppError(
                    'Database operation failed',
                    500,
                    'DATABASE_ERROR',
                    {
                        code: error.code,
                        sqlState: error.sqlState
                    }
                );
        }
    }
}

module.exports = DepartmentRepository;