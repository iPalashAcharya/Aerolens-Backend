const db = require('../db');
const AppError = require('../utils/appError');

class MemberRepository {
    async findById(memberId) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT memberId, memberName, memberContact, email, designation, 
                        isRecruiter, isActive, lastLogin, createdAt, updatedAt
                 FROM member 
                 WHERE memberId = ?`,
                [memberId]
            );
            return rows[0] || null;
        } catch (error) {
            throw new AppError('Database error while finding member', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    async findByEmail(email) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT memberId, memberName, memberContact, email, password, designation,
                        isRecruiter, isActive, lastLogin, createdAt, updatedAt
                 FROM member 
                 WHERE email = ?`,
                [email]
            );
            return rows[0] || null;
        } catch (error) {
            throw new AppError('Database error while finding member', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    async create(memberData) {
        const connection = await db.getConnection();
        try {
            const [result] = await connection.execute(
                `INSERT INTO member (memberName, memberContact, email, password, designation, isRecruiter)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    memberData.memberName,
                    memberData.memberContact,
                    memberData.email,
                    memberData.password,
                    memberData.designation,
                    memberData.isRecruiter || false
                ]
            );
            return await this.findById(result.insertId);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new AppError('Email already exists', 409, 'DUPLICATE_EMAIL');
            }
            throw new AppError('Database error while creating member', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    async updateLastLogin(memberId) {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `UPDATE member SET lastLogin = NOW() WHERE memberId = ?`,
                [memberId]
            );
        } catch (error) {
            throw new AppError('Database error while updating last login', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    async updatePassword(memberId, newPassword) {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `UPDATE member SET password = ?, updatedAt = NOW() WHERE memberId = ?`,
                [newPassword, memberId]
            );
        } catch (error) {
            throw new AppError('Database error while updating password', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    async deactivateAccount(memberId) {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `UPDATE member SET isActive = FALSE WHERE memberId = ?`,
                [memberId]
            );
        } catch (error) {
            throw new AppError('Database error while deactivating account', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }
}

module.exports = new MemberRepository();