/**
 * Candidate Compensation Backfill Script
 *
 * Migrates old CTC fields → new structured compensation fields
 *
 * currentCTC  → currentCTCAmount
 * expectedCTC → expectedCTCAmount
 *
 * Currency + Type derived from candidate location country
 *
 * India → INR + ANNUAL
 * USA   → USD + HOURLY
 */
async function runMigration() {

    const database = require('../db');
    const db = await database.getConnection();

    console.log("Connected to database");

    try {

        await db.beginTransaction();

        console.log("Fetching lookup IDs...");

        const [currencies] = await db.execute(`
            SELECT lookupKey, value
            FROM lookup
            WHERE tag='currency'
        `);

        const [types] = await db.execute(`
            SELECT lookupKey, value
            FROM lookup
            WHERE tag='compensationType'
        `);

        const currencyMap = {};
        currencies.forEach(c => currencyMap[c.value.toUpperCase()] = c.lookupKey);

        const typeMap = {};
        types.forEach(t => typeMap[t.value.toUpperCase()] = t.lookupKey);

        const INR_ID = currencyMap["INR"];
        const USD_ID = currencyMap["USD"];

        const ANNUAL_ID = typeMap["ANNUAL"];
        const HOURLY_ID = typeMap["HOURLY"];

        if (!INR_ID || !USD_ID || !ANNUAL_ID || !HOURLY_ID) {
            throw new Error("Required lookup values not found");
        }

        console.log("Lookup IDs resolved:");
        console.log({
            INR_ID,
            USD_ID,
            ANNUAL_ID,
            HOURLY_ID
        });

        console.log("Running CURRENT CTC migration...");

        const [currentResult] = await db.execute(`
            UPDATE candidate c
            LEFT JOIN location loc
            ON loc.locationId = c.currentLocation

            SET
                c.currentCTCAmount = c.currentCTC,

                c.currentCTCCurrencyId =
                    CASE
                        WHEN LOWER(loc.country) = 'india'
                            THEN ?
                        WHEN LOWER(loc.country) IN ('usa','united states','united states of america')
                            THEN ?
                        ELSE NULL
                    END,

                c.currentCTCTypeId =
                    CASE
                        WHEN LOWER(loc.country) = 'india'
                            THEN ?
                        WHEN LOWER(loc.country) IN ('usa','united states','united states of america')
                            THEN ?
                        ELSE NULL
                    END

            WHERE
                c.currentCTC IS NOT NULL
                AND c.currentCTCAmount IS NULL
                AND c.currentCTCCurrencyId IS NULL
                AND c.currentCTCTypeId IS NULL
        `, [INR_ID, USD_ID, ANNUAL_ID, HOURLY_ID]);

        console.log(`Current CTC rows updated: ${currentResult.affectedRows}`);

        console.log("Running EXPECTED CTC migration...");

        const [expectedResult] = await db.execute(`
            UPDATE candidate c
            LEFT JOIN location loc
            ON loc.locationId = c.expectedLocation

            SET
                c.expectedCTCAmount = c.expectedCTC,

                c.expectedCTCCurrencyId =
                    CASE
                        WHEN LOWER(loc.country) = 'india'
                            THEN ?
                        WHEN LOWER(loc.country) IN ('usa','united states','united states of america')
                            THEN ?
                        ELSE NULL
                    END,

                c.expectedCTCTypeId =
                    CASE
                        WHEN LOWER(loc.country) = 'india'
                            THEN ?
                        WHEN LOWER(loc.country) IN ('usa','united states','united states of america')
                            THEN ?
                        ELSE NULL
                    END

            WHERE
                c.expectedCTC IS NOT NULL
                AND c.expectedCTCAmount IS NULL
                AND c.expectedCTCCurrencyId IS NULL
                AND c.expectedCTCTypeId IS NULL
        `, [INR_ID, USD_ID, ANNUAL_ID, HOURLY_ID]);

        console.log(`Expected CTC rows updated: ${expectedResult.affectedRows}`);

        await db.commit();

        console.log("Migration completed successfully.");

    } catch (error) {

        console.error("Migration failed:", error);

        await db.rollback();

        console.log("Transaction rolled back.");
    } finally {
        db.release();
    }
}

runMigration();