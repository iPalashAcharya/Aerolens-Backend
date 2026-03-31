const db = require('../db');

async function getCandidate(candidateId) {
    const [rows] = await db.execute(
        `SELECT candidateId, name, yoe, currentCtc, expectedCtc, noticePeriod, resumeKey
         FROM candidate
         WHERE candidateId = ?`,
        [candidateId]
    );

    return rows[0] || null;
}

module.exports = {
    getCandidate
};
