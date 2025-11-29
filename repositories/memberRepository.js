const db = require('../db');
const AppError = require('../utils/appError');

class MemberRepository {
    async findById(memberId) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT m.memberId, m.memberName, m.memberContact, m.email, l.value AS designation,
                        m.isRecruiter, m.isActive, m.lastLogin, m.createdAt, m.updatedAt
                 FROM member m INNER JOIN lookup l
                 ON m.designation = l.lookupKey
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

    async findMemberById(memberId, client) {
        const connection = client || await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT
                m.memberId,
                m.memberName,
                m.memberContact,
                m.email,
                l.value AS designation,
                m.isRecruiter,
                m.isActive,
                m.lastLogin,
                m.createdAt,
                m.updatedAt,
                loc.cityName,
                loc.country,
                c.clientName,
                m.organisation,
                m.isInterviewer,
                m.interviewerCapacity,
                GROUP_CONCAT(ls.value ORDER BY ls.value SEPARATOR ', ') AS skills
            FROM member m
            INNER JOIN lookup l
                ON m.designation = l.lookupKey
            LEFT JOIN location loc
                ON m.locationId = loc.locationId
            LEFT JOIN client c
                ON c.clientId = m.clientId
            LEFT JOIN interviewer_skill isk
                ON isk.interviewerId = m.memberId
            LEFT JOIN lookup ls
                ON ls.lookupKey = isk.skillId

            WHERE m.memberId = ? AND m.isActive = TRUE
            GROUP BY
                m.memberId, m.memberName, m.memberContact, m.email, l.value,
                m.isRecruiter, m.isActive, m.lastLogin, m.createdAt, m.updatedAt,
                loc.cityName, loc.country, c.clientName,
                m.organisation, m.isInterviewer, m.interviewerCapacity;`,
                [memberId]
            );
            return rows[0] || null;
        } catch (error) {
            throw new AppError('Database error while finding member', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    async createInterviewerSkill(memberId, createData, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `INSERT INTO interviewer_skill (interviewerId,skillId,proficiencyLevel,years_of_experience,created_at,updated_at)
                VALUES (?,?,?,?,NOW(),NOW());`, [memberId, createData.skill, createData.proficiencyLevel, createData.yearsOfExperience]
            );

            return {
                interviewerSkillId: result.insertId,
                ...createData
            }
        } catch (error) {
            throw new AppError(
                'Database error while creating interviewer skill',
                500,
                'DB_ERROR',
                error.message
            );
        }
    }

    async createInterviewerTimeslot(memberId, createData, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `INSERT INTO interviewerTimeslot(interviewerId,timeslotId,dayOfWeek,isActive)
                VALUES(?,?,?,TRUE)`, [memberId, createData.timeslot, createData.dayOfWeek]
            );
            return {
                interviewerTimeslotId: result.insertId,
                ...createData
            }

        } catch (error) {
            throw new AppError(
                'Database error while creating interviewer skill',
                500,
                'DB_ERROR',
                error.message
            );
        }
    }

    async findAll(client) {
        const connection = client;
        try {
            const [rows] = await connection.execute(
                `SELECT m.memberId, m.memberName, m.memberContact, m.email, l.value AS designation, m.isRecruiter, m.isActive, m.lastLogin,
                m.createdAt,
                m.updatedAt,
                loc.cityName,
                loc.country,
                c.clientName,
                m.organisation,
                m.isInterviewer,
                m.interviewerCapacity,
                GROUP_CONCAT(ls.value ORDER BY ls.value SEPARATOR ', ') AS skills
            FROM member m
            INNER JOIN lookup l
                ON m.designation = l.lookupKey
            LEFT JOIN location loc
                ON m.locationId = loc.locationId
            LEFT JOIN client c
                ON c.clientId = m.clientId
            LEFT JOIN interviewer_skill isk
                ON isk.interviewerId = m.memberId
            LEFT JOIN lookup ls
                ON ls.lookupKey = isk.skillId
            WHERE m.isActive = TRUE
            GROUP BY
                m.memberId, m.memberName, m.memberContact, m.email, l.value,
                m.isRecruiter, m.isActive, m.lastLogin, m.createdAt, m.updatedAt,
                loc.cityName, loc.country, c.clientName,
                m.organisation, m.isInterviewer, m.interviewerCapacity;`
            );
            return rows;
        } catch (error) {
            throw new AppError('Database Error while fetching members', 500, 'DB_ERROR', error.message);
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

    async findMemberByEmail(email) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT m.memberId, m.memberName, m.memberContact, m.email, l.value AS designation, m.isRecruiter, m.isActive, m.lastLogin,
                m.createdAt,
                m.updatedAt,
                loc.cityName,
                loc.country,
                c.clientName,
                m.organisation,
                m.isInterviewer,
                m.interviewerCapacity,
                GROUP_CONCAT(ls.value ORDER BY ls.value SEPARATOR ', ') AS skills
            FROM member m
            INNER JOIN lookup l
                ON m.designation = l.lookupKey
            LEFT JOIN location loc
                ON m.locationId = loc.locationId
            LEFT JOIN client c
                ON c.clientId = m.clientId
            LEFT JOIN interviewer_skill isk
                ON isk.interviewerId = m.memberId
            LEFT JOIN lookup ls
                ON ls.lookupKey = isk.skillId
            WHERE m.email = ? AND m.isActive = TRUE
            GROUP BY
                m.memberId, m.memberName, m.memberContact, m.email, l.value,
                m.isRecruiter, m.isActive, m.lastLogin, m.createdAt, m.updatedAt,
                loc.cityName, loc.country, c.clientName,
                m.organisation, m.isInterviewer, m.interviewerCapacity;`,
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
                let field = 'field';
                const errorMsg = error.message.toLowerCase();

                if (errorMsg.includes('email')) field = 'Email';
                else if (errorMsg.includes('contact')) field = 'Contact number';
                else if (errorMsg.includes('name')) field = 'Name';

                throw new AppError(
                    `${field} already exists`,
                    409,
                    `DUPLICATE_${field.toUpperCase().replace(/\s+/g, '_')}`
                );
            }
        } finally {
            connection.release();
        }
    }

    async updateMember(memberId, updateData, client) {
        const connection = client;

        try {
            if (!memberId) {
                throw new AppError('Member ID is required', 400, 'MISSING_MEMBER_ID');
            }

            if (!updateData || Object.keys(updateData).length === 0) {
                throw new AppError('Update data is required', 400, 'MISSING_UPDATE_DATA');
            }

            const allowedFields = [
                'memberName', 'memberContact', 'email', 'designation', 'isRecruiter', 'locationId', 'clientId', 'organisation', 'isInterviewer'
            ];

            const filteredData = {};
            Object.keys(updateData).forEach(key => {
                if (allowedFields.includes(key)) {
                    filteredData[key] = updateData[key];
                }
            });

            if (Object.keys(filteredData).length === 0) {
                throw new AppError('No valid fields to update', 400, 'NO_VALID_FIELDS');
            }

            const fields = Object.keys(filteredData);
            const values = Object.values(filteredData);

            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `UPDATE member SET ${setClause} WHERE memberId = ?`;

            const [result] = await connection.execute(query, [...values, memberId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Member with ID ${memberId} not found`,
                    404,
                    'MEMBER_NOT_FOUND'
                );
            }

            return {
                memberId,
                ...updateData
            };
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            throw new AppError(
                'Database error while Updating Member',
                500,
                'DB_ERROR',
                error.message
            );
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

module.exports = MemberRepository;