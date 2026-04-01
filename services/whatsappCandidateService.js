const db = require('../db');

async function getCandidate(candidateId) {
    const [rows] = await db.execute(
        `SELECT candidateId,
                candidateName    AS name,
                experienceYears  AS yoe,
                currentCTC       AS currentCtc,
                expectedCTC      AS expectedCtc,
                noticePeriod,
                resumeFilename   AS resumeKey
         FROM candidate
         WHERE candidateId = ?`,
        [candidateId]
    );

    return rows[0] || null;
}

module.exports = {
    getCandidate
};
