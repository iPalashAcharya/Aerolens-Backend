const fetchSecrets = require("../config/secrets");

async function backfillCandidateWorkMode() {
    await fetchSecrets();
    const db = await require("../db").getConnection();

    console.log("Starting candidate work mode backfill...");

    try {
        await db.beginTransaction();

        const [lookupRows] = await db.execute(
            `
            SELECT lookupKey
            FROM lookup
            WHERE tag = 'workMode'
              AND value = 'Onsite'
            LIMIT 1
            `
        );

        if (!lookupRows.length) {
            throw new Error("Lookup value not found for tag='workMode' and value='Onsite'");
        }

        const onsiteWorkModeId = lookupRows[0].lookupKey;
        console.log(`Retrieved workMode lookupKey: ${onsiteWorkModeId}`);

        const [updateResult] = await db.execute(
            `
            UPDATE candidate
            SET workModeId = ?
            WHERE workModeId IS NULL
            `,
            [onsiteWorkModeId]
        );

        console.log(`Candidates updated: ${updateResult.affectedRows}`);

        await db.commit();
        console.log("Candidate work mode backfill completed successfully.");
    } catch (error) {
        console.error("Candidate work mode backfill failed:", error);

        try {
            await db.rollback();
            console.log("Transaction rolled back.");
        } catch (rollbackError) {
            console.error("Rollback failed:", rollbackError);
        }
    } finally {
        db.release();
        console.log("Database connection released.");
    }
}

backfillCandidateWorkMode();
