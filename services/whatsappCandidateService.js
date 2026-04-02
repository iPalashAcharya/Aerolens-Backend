const db = require('../db');

async function getCandidate(candidateId) {
    const [rows] = await db.execute(
        `SELECT c.candidateId,
                c.candidateName    AS name,
                c.contactNumber,
                c.email,
                c.linkedinProfileUrl AS linkedinUrl,
                c.experienceYears  AS yoe,
                c.currentCTC,
                c.expectedCTC,
                c.currentCTCAmount,
                c.currentCTCCurrencyId,
                c.currentCTCTypeId,
                c.expectedCTCAmount,
                c.expectedCTCCurrencyId,
                c.expectedCTCTypeId,
                c.noticePeriod,
                c.resumeFilename   AS resumeKey,
                curCurr.value      AS currentCurrencyValue,
                curType.value      AS currentCompensationTypeValue,
                expCurr.value      AS expectedCurrencyValue,
                expType.value      AS expectedCompensationTypeValue
         FROM candidate c
         LEFT JOIN lookup curCurr
           ON c.currentCTCCurrencyId = curCurr.lookupKey AND curCurr.tag = 'currency'
         LEFT JOIN lookup curType
           ON c.currentCTCTypeId = curType.lookupKey AND curType.tag = 'compensationType'
         LEFT JOIN lookup expCurr
           ON c.expectedCTCCurrencyId = expCurr.lookupKey AND expCurr.tag = 'currency'
         LEFT JOIN lookup expType
           ON c.expectedCTCTypeId = expType.lookupKey AND expType.tag = 'compensationType'
         WHERE c.candidateId = ?`,
        [candidateId]
    );

    return rows[0] || null;
}

module.exports = {
    getCandidate
};
