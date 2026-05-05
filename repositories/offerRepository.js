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
                `SELECT offerId, candidateId, jobProfileRequirementId, vendorId, reportingManagerId,
                        employmentTypeLookupId, workModelLookupId, joiningDate, offeredCTCAmount,
                        currencyLookupId, compensationTypeLookupId, variablePay, joiningBonus,
                        offerLetterSent, serviceAgreementSent, ndaSent, codeOfConductSent,
                        offerStatus, offerVersion, createdBy, createdAt, updatedAt, isDeleted, deletedAt
                 FROM offer WHERE offerId = ?`,
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
                rv.vendorName,
                lcur.value AS currencyName,
                lcomp.value AS compensationTypeName,
                m.memberName AS createdByName,
                DATE_FORMAT(o.createdAt, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
            FROM offer o
            LEFT JOIN candidate c ON c.candidateId = o.candidateId
            LEFT JOIN jobProfileRequirement jpr ON jpr.jobProfileRequirementId = o.jobProfileRequirementId
            LEFT JOIN jobProfile jp ON jp.jobProfileId = jpr.jobProfileId
            LEFT JOIN lookup let ON let.lookupKey = o.employmentTypeLookupId AND let.tag = 'employmentType'
            LEFT JOIN lookup wm ON wm.lookupKey = o.workModelLookupId AND wm.tag = 'workMode'
            LEFT JOIN recruitmentVendor rv ON rv.vendorId = o.vendorId
            LEFT JOIN lookup lcur ON lcur.lookupKey = o.currencyLookupId AND lcur.tag = 'currency'
            LEFT JOIN lookup lcomp ON lcomp.lookupKey = o.compensationTypeLookupId AND lcomp.tag = 'compensationType'
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
                `SELECT
                    o.offerId, o.candidateId, o.jobProfileRequirementId, o.vendorId, o.reportingManagerId,
                    o.employmentTypeLookupId, o.workModelLookupId, o.joiningDate, o.offeredCTCAmount,
                    o.currencyLookupId, o.compensationTypeLookupId, o.variablePay, o.joiningBonus,
                    o.offerLetterSent, o.serviceAgreementSent, o.ndaSent, o.codeOfConductSent,
                    o.offerStatus, o.offerVersion, o.createdBy, o.createdAt, o.updatedAt,
                    o.isDeleted, o.deletedAt,
                    let.value AS employmentTypeName
                 FROM offer o
                 LEFT JOIN lookup let ON let.lookupKey = o.employmentTypeLookupId AND let.tag = 'employmentType'
                 WHERE o.offerId = ? AND o.isDeleted = 0`,
                [offerId]
            );
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error, 'getOfferById');
        }
    }

    async getActiveOfferByCandidate(candidateId, client) {
        const connection = client;
        try {
            const [rows] = await connection.execute(
                `SELECT offerId
                 FROM offer
                 WHERE candidateId = ?
                   AND isDeleted = 0
                   AND offerStatus = 'PENDING'
                 LIMIT 1`,
                [candidateId]
            );
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error, 'getActiveOfferByCandidate');
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
                `INSERT INTO offer_termination (offerId, terminationDate, terminationReason, terminatedBy)
                 VALUES (?, ?, ?, ?)`,
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

    async reviseOffer(offerId, revisionData, client) {
        const connection = client;
        try {
            await connection.execute(
                `INSERT INTO offer_revision (offerId, previousCTC, newCTC, previousJoiningDate, newJoiningDate, reason, revisedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    offerId,
                    revisionData.previousCTC,
                    revisionData.newCTC,
                    revisionData.previousJoiningDate,
                    revisionData.newJoiningDate,
                    revisionData.reason,
                    revisionData.revisedBy
                ]
            );
            const [result] = await connection.execute(
                `UPDATE offer
                 SET offeredCTCAmount = ?, joiningDate = ?, offerVersion = offerVersion + 1
                 WHERE offerId = ? AND isDeleted = 0`,
                [revisionData.newCTC, revisionData.newJoiningDate, offerId]
            );
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'reviseOffer');
        }
    }

    async insertOfferStatus(statusData, client) {
        const connection = client;
        const toTinyInt = (v) => (v !== undefined && v !== null ? (v ? 1 : 0) : null);
        try {
            await connection.execute(
                `INSERT INTO offer_status_history (offerId, status, decisionDate, signedOfferLetterReceived, signedServiceAgreementReceived, signedNDAReceived, signedCodeOfConductReceived, rejectionReason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    statusData.offerId,
                    statusData.status,
                    statusData.decisionDate,
                    toTinyInt(statusData.signedOfferLetterReceived),
                    toTinyInt(statusData.signedServiceAgreementReceived),
                    toTinyInt(statusData.signedNDAReceived),
                    toTinyInt(statusData.signedCodeOfConductReceived),
                    statusData.rejectionReason ?? null
                ]
            );
        } catch (error) {
            this._handleDatabaseError(error, 'insertOfferStatus');
        }
    }

    async updateOfferStatus(offerId, status, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `UPDATE offer SET offerStatus = ? WHERE offerId = ? AND isDeleted = 0`,
                [status, offerId]
            );
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'updateOfferStatus');
        }
    }

    async getOfferDetails(offerId, client) {
        const connection = client;
        try {
            const [rows] = await connection.execute(
                `SELECT
                    o.offerId, o.candidateId, o.jobProfileRequirementId, o.vendorId, o.reportingManagerId,
                    o.employmentTypeLookupId, o.workModelLookupId, o.joiningDate, o.offeredCTCAmount,
                    o.currencyLookupId, o.compensationTypeLookupId, o.variablePay, o.joiningBonus,
                    o.offerLetterSent, o.serviceAgreementSent, o.ndaSent, o.codeOfConductSent,
                    o.offerStatus, o.offerVersion, o.createdBy, o.createdAt, o.updatedAt,
                    c.candidateName,
                    jp.jobRole,
                    let.value AS employmentTypeName,
                    wm.value AS workModeName,
                    rv.vendorName,
                    lcur.value AS currencyName,
                    lcomp.value AS compensationTypeName,
                    m.memberName AS createdByName,
                    rm.memberName AS reportingManagerName,
                    DATE_FORMAT(o.createdAt, '%Y-%m-%dT%H:%i:%sZ') AS createdAtFormatted
                 FROM offer o
                 LEFT JOIN candidate c ON c.candidateId = o.candidateId
                 LEFT JOIN jobProfileRequirement jpr ON jpr.jobProfileRequirementId = o.jobProfileRequirementId
                 LEFT JOIN jobProfile jp ON jp.jobProfileId = jpr.jobProfileId
                 LEFT JOIN lookup let ON let.lookupKey = o.employmentTypeLookupId AND let.tag = 'employmentType'
                 LEFT JOIN lookup wm ON wm.lookupKey = o.workModelLookupId AND wm.tag = 'workMode'
                 LEFT JOIN recruitmentVendor rv ON rv.vendorId = o.vendorId
                 LEFT JOIN lookup lcur ON lcur.lookupKey = o.currencyLookupId AND lcur.tag = 'currency'
                 LEFT JOIN lookup lcomp ON lcomp.lookupKey = o.compensationTypeLookupId AND lcomp.tag = 'compensationType'
                 LEFT JOIN member m ON m.memberId = o.createdBy
                 LEFT JOIN member rm ON rm.memberId = o.reportingManagerId
                 WHERE o.offerId = ? AND o.isDeleted = 0`,
                [offerId]
            );
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error, 'getOfferDetails');
        }
    }

    async getOfferRevisions(offerId, client) {
        const connection = client;
        try {
            const [rows] = await connection.execute(
                `SELECT
                    rev.offerId,
                    rev.previousCTC,
                    rev.newCTC,
                    rev.previousJoiningDate,
                    rev.newJoiningDate,
                    rev.reason,
                    rev.revisedBy,
                    m.memberName AS revisedByName
                 FROM offer_revision rev
                 LEFT JOIN member m ON m.memberId = rev.revisedBy
                 WHERE rev.offerId = ?
                 ORDER BY rev.previousJoiningDate DESC, rev.newCTC DESC`,
                [offerId]
            );
            const list = rows || [];
            return list.map((row, index) => ({ ...row, revisionId: index + 1 }));
        } catch (error) {
            this._handleDatabaseError(error, 'getOfferRevisions');
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

    async getDeletedOffers(client) {
        const connection = client;
        try {
            const [rows] = await connection.query(
                `SELECT
                    o.offerId,
                    c.candidateName,
                    jp.jobRole,
                    o.offerStatus,
                    o.offeredCTCAmount,
                    o.joiningDate,
                    DATE_FORMAT(
                        CONVERT_TZ(o.deletedAt, @@session.time_zone, '+00:00'),
                        '%Y-%m-%dT%H:%i:%s.000Z'
                    ) AS deleted_at
                 FROM offer o
                 LEFT JOIN candidate c ON c.candidateId = o.candidateId
                 LEFT JOIN jobProfileRequirement jpr ON jpr.jobProfileRequirementId = o.jobProfileRequirementId
                 LEFT JOIN jobProfile jp ON jp.jobProfileId = jpr.jobProfileId
                 WHERE o.isDeleted = 1
                 ORDER BY o.deletedAt DESC`
            );
            return { rows };
        } catch (error) {
            this._handleDatabaseError(error, 'getDeletedOffers');
        }
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

    async saveDocument(offerId, docData, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `UPDATE offer
                 SET doc_type         = ?,
                     doc_file_name    = ?,
                     doc_s3_key       = ?,
                     doc_mime_type    = ?,
                     doc_file_size    = ?,
                     doc_generated_at = NOW(),
                     doc_generated_by = ?
                 WHERE offerId = ? AND isDeleted = 0`,
                [
                    docData.docType,
                    docData.docFileName,
                    docData.docS3Key,
                    docData.docMimeType ?? 'application/pdf',
                    docData.docFileSize ?? null,
                    docData.generatedBy ?? null,
                    offerId,
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            this._handleDatabaseError(error, 'saveDocument');
        }
    }

    async getDocument(offerId, client) {
        const connection = client;
        try {
            const [rows] = await connection.execute(
                `SELECT
                    offerId,
                    doc_type         AS docType,
                    doc_file_name    AS docFileName,
                    doc_s3_key       AS docS3Key,
                    doc_mime_type    AS docMimeType,
                    doc_file_size    AS docFileSize,
                    doc_generated_by AS docGeneratedBy,
                    DATE_FORMAT(doc_generated_at, '%Y-%m-%dT%H:%i:%sZ') AS docGeneratedAt
                 FROM offer
                 WHERE offerId = ? AND isDeleted = 0`,
                [offerId]
            );
            const row = rows[0];
            if (!row || !row.docType) return null;
            return row;
        } catch (error) {
            this._handleDatabaseError(error, 'getDocument');
        }
    }

    async restore(offerId, client) {
        try {
            const [result] = await client.execute(
                `UPDATE offer
                 SET isDeleted = 0, deletedAt = NULL
                 WHERE offerId = ? AND isDeleted = 1`,
                [offerId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            this._handleDatabaseError(error, 'restore');
        }
    }
}

module.exports = OfferRepository;
