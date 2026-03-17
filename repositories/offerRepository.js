const AppError = require('../utils/appError');

class OfferRepository {
    constructor(db) {
        this.db = db;
    }

    async createOffer(offerData, client) {
        const connection = client;
        try {
            const query = `
            INSERT INTO offer (
                candidateId, jobProfileRequirementId, vendorId, reportingManagerId,
                employmentTypeLookupId, workModelLookupId, joiningDate, offeredCTCAmount,
                currencyLookupId, compensationTypeLookupId, variablePay, joiningBonus,
                offerLetterSent, serviceAgreementSent, ndaSent, codeOfConductSent,
                offerStatus, offerVersion, createdBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const [result] = await connection.execute(query, [
                offerData.candidateId,
                offerData.jobProfileRequirementId,
                offerData.vendorId ?? null,
                offerData.reportingManagerId,
                offerData.employmentTypeLookupId,
                offerData.workModelLookupId,
                offerData.joiningDate,
                offerData.offeredCTCAmount ?? null,
                offerData.currencyLookupId ?? null,
                offerData.compensationTypeLookupId ?? null,
                offerData.variablePay ?? null,
                offerData.joiningBonus ?? null,
                offerData.offerLetterSent ?? null,
                offerData.serviceAgreementSent ?? null,
                offerData.ndaSent ?? null,
                offerData.codeOfConductSent ?? null,
                offerData.offerStatus ?? 'PENDING',
                offerData.offerVersion ?? 1,
                offerData.createdBy
            ]);
            const offerId = result.insertId;
            const [rows] = await connection.execute(
                'SELECT * FROM offer WHERE offerId = ?',
                [offerId]
            );
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error, 'createOffer');
        }
    }

    async getOffers(client) {
        const connection = client;
        try {
            const query = `
            SELECT
                o.offerId,
                c.candidateName,
                jp.jobRole,
                let.value AS employmentTypeName,
                wm.value AS workModeName,
                o.joiningDate,
                o.offeredCTCAmount,
                o.offerStatus,
                o.offerVersion,
                o.variablePay,
                o.joiningBonus,
                m.memberName AS createdByName,
                DATE_FORMAT(o.createdAt, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
            FROM offer o
            LEFT JOIN candidate c ON c.candidateId = o.candidateId
            LEFT JOIN jobProfileRequirement jpr ON jpr.jobProfileRequirementId = o.jobProfileRequirementId
            LEFT JOIN jobProfile jp ON jp.jobProfileId = jpr.jobProfileId
            LEFT JOIN lookup let ON let.lookupKey = o.employmentTypeLookupId AND let.tag = 'employmentType'
            LEFT JOIN lookup wm ON wm.lookupKey = o.workModelLookupId AND wm.tag = 'workMode'
            LEFT JOIN member m ON m.memberId = o.createdBy
            WHERE o.isDeleted = 0
            ORDER BY o.createdAt DESC
            `;
            const [rows] = await connection.query(query);
            return rows;
        } catch (error) {
            this._handleDatabaseError(error, 'getOffers');
        }
    }

    async getOfferById(offerId, client) {
        const connection = client;
        try {
            const [rows] = await connection.execute(
                'SELECT * FROM offer WHERE offerId = ? AND isDeleted = 0',
                [offerId]
            );
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error, 'getOfferById');
        }
    }

    async softDeleteOffer(offerId, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `UPDATE offer
                 SET isDeleted = 1, deletedAt = NOW()
                 WHERE offerId = ? AND isDeleted = 0`,
                [offerId]
            );
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'softDeleteOffer');
        }
    }

    async terminateOffer(offerId, terminationData, client) {
        const connection = client;
        try {
            await connection.execute(
                `INSERT INTO offer_termination (offerId, terminationDate, terminationReason, terminatedBy, createdAt)
                 VALUES (?, ?, ?, ?, NOW())`,
                [
                    offerId,
                    terminationData.terminationDate,
                    terminationData.terminationReason,
                    terminationData.terminatedBy
                ]
            );
            const [result] = await connection.execute(
                `UPDATE offer SET offerStatus = 'TERMINATED' WHERE offerId = ? AND isDeleted = 0`,
                [offerId]
            );
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'terminateOffer');
        }
    }

    async getOfferFormData(client) {
        const connection = client;

        const employmentTypesPromise = connection.query(`
            SELECT lookupKey AS employmentTypeLookupId, value AS employmentTypeName
            FROM lookup WHERE tag = 'employmentType' ORDER BY value
        `);
        const workModesPromise = connection.query(`
            SELECT lookupKey AS workModelLookupId, value AS workModelName
            FROM lookup WHERE tag = 'workMode' ORDER BY value
        `);
        const currenciesPromise = connection.query(`
            SELECT lookupKey AS currencyLookupId, value AS currencyName
            FROM lookup WHERE tag = 'currency' ORDER BY value
        `);
        const compensationTypesPromise = connection.query(`
            SELECT lookupKey AS compensationTypeLookupId, value AS compensationTypeName
            FROM lookup WHERE tag = 'compensationType' ORDER BY value
        `);
        const vendorsPromise = connection.query(`
            SELECT vendorId, vendorName FROM recruitmentVendor ORDER BY vendorName
        `);
        const membersPromise = connection.query(`
            SELECT memberId, memberName FROM member WHERE isActive = TRUE ORDER BY memberName
        `);
        const jobProfileRequirementsPromise = connection.query(`
            SELECT
                jpr.jobProfileRequirementId,
                jp.jobRole,
                c.clientName,
                d.departmentName
            FROM jobProfileRequirement jpr
            INNER JOIN jobProfile jp ON jp.jobProfileId = jpr.jobProfileId
            LEFT JOIN client c ON c.clientId = jpr.clientId
            LEFT JOIN department d ON d.departmentId = jpr.departmentId
            LEFT JOIN lookup s ON s.lookupKey = jpr.statusId AND s.tag = 'profileStatus'
            WHERE s.value IN ('Pending', 'In Progress')
            ORDER BY jpr.jobProfileRequirementId DESC
        `);

        const [
            employmentTypes,
            workModes,
            currencies,
            compensationTypes,
            vendors,
            members,
            jobProfileRequirements
        ] = await Promise.all([
            employmentTypesPromise,
            workModesPromise,
            currenciesPromise,
            compensationTypesPromise,
            vendorsPromise,
            membersPromise,
            jobProfileRequirementsPromise
        ]);

        return {
            employmentTypes: employmentTypes[0],
            workModes: workModes[0],
            currencies: currencies[0],
            compensationTypes: compensationTypes[0],
            vendors: vendors[0],
            members: members[0],
            jobProfileRequirements: jobProfileRequirements[0]
        };
    }

    _handleDatabaseError(error, operation) {
        if (error instanceof AppError) throw error;
        const errorMappings = {
            ER_BAD_FIELD_ERROR: { status: 500, errorCode: 'DATABASE_SCHEMA_ERROR', message: 'Database schema error' },
            ER_NO_SUCH_TABLE: { status: 500, errorCode: 'DATABASE_SCHEMA_ERROR', message: 'Required table not found' },
            ER_NO_REFERENCED_ROW_2: { status: 400, errorCode: 'FOREIGN_KEY_CONSTRAINT', message: 'Invalid reference - record does not exist' },
            ER_DATA_TOO_LONG: { status: 400, errorCode: 'DATA_TOO_LONG', message: 'One or more fields exceed maximum length' }
        };
        const mapping = errorMappings[error.code];
        if (mapping) {
            throw new AppError(mapping.message, mapping.status, mapping.errorCode, { operation });
        }
        throw new AppError('Database operation failed', 500, 'DATABASE_ERROR', { operation, code: error.code });
    }
}

module.exports = OfferRepository;
