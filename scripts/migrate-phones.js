/**
 * Member contact → E.164 staged migration
 *
 * Populates member.memberContactE164 from member.memberContact.
 * Never updates memberContact in this script.
 *
 * Prerequisite: run scripts/sql-migration.sql Step 1 (ADD COLUMN memberContactE164).
 *
 * Usage:
 *   node scripts/migrate-phones.js
 *   node scripts/migrate-phones.js --dry-run
 *   node scripts/migrate-phones.js --limit=50
 *
 * Reports (project root):
 *   migration_errors.json
 *   migration_duplicates.json
 */
require('dotenv').config({
    path: require('path').resolve(__dirname, '../.env')
});

const fs = require('fs');
const path = require('path');
const fetchSecrets = require('../config/secrets');
const { parsePhoneNumber } = require('libphonenumber-js/max');

const PROGRESS_EVERY = 100;
const OUT_ERRORS = path.join(process.cwd(), 'migration_errors.json');
const OUT_DUPES = path.join(process.cwd(), 'migration_duplicates.json');

function parseArgs(argv) {
    let dryRun = false;
    let limit = null;
    for (const a of argv.slice(2)) {
        if (a === '--dry-run') {
            dryRun = true;
        } else if (a.startsWith('--limit=')) {
            const n = parseInt(a.slice('--limit='.length), 10);
            if (Number.isFinite(n) && n > 0) {
                limit = n;
            }
        }
    }
    return { dryRun, limit };
}

/** Step 3: location.country → default country for libphonenumber. Unknown / NULL → IN */
function resolveCountryHint(locationCountry) {
    if (locationCountry == null || String(locationCountry).trim() === '') {
        return 'IN';
    }
    const c = String(locationCountry).trim().toLowerCase();
    if (c === 'india' || c === 'in') {
        return 'IN';
    }
    if (
        c === 'usa' ||
        c === 'us' ||
        c === 'united states' ||
        c === 'united states of america'
    ) {
        return 'US';
    }
    return 'IN';
}

function stripForPlusPrefix(raw) {
    return String(raw).replace(/[\s\-()]/g, '');
}

function digitsOnly(raw) {
    return String(raw).replace(/\D/g, '');
}

/**
 * Step 1 → 2 → 3 decision chain (see product spec).
 * @returns {{ e164: string } | { error: string, step?: string, detail?: string } | { skip: true }}
 */
function normalizeMemberContactToE164(rawContact, locationCountry) {
    if (rawContact == null || String(rawContact).trim() === '') {
        return { skip: true };
    }

    const rawStr = String(rawContact);

    // Step 1: + prefix after stripping spaces/dashes/parens
    const strippedPlus = stripForPlusPrefix(rawStr);
    if (/^\+\d{7,15}$/.test(strippedPlus)) {
        try {
            const pn = parsePhoneNumber(strippedPlus);
            if (pn && pn.isValid()) {
                return { e164: pn.number };
            }
        } catch (_) {
            /* fall through to step 2 */
        }
    }

    const digits = digitsOnly(rawStr);

    // Step 2: embedded country code (digits only)
    if (/^91\d{10}$/.test(digits)) {
        try {
            const pn = parsePhoneNumber(`+${digits}`);
            if (pn && pn.isValid()) {
                return { e164: pn.number };
            }
        } catch (_) {
            /* fall through */
        }
    }
    if (/^1\d{10}$/.test(digits)) {
        try {
            const pn = parsePhoneNumber(`+${digits}`);
            if (pn && pn.isValid()) {
                return { e164: pn.number };
            }
        } catch (_) {
            /* fall through */
        }
    }

    // Step 3: 10-digit local + location hint
    if (digits.length === 10) {
        const hint = resolveCountryHint(locationCountry);
        try {
            const pn = parsePhoneNumber(digits, hint);
            if (pn && pn.isValid()) {
                return { e164: pn.number };
            }
        } catch (_) {
            /* fall through */
        }
        return {
            error: 'UNRESOLVABLE',
            step: 'STEP_3',
            detail: 'invalid 10-digit local for location hint'
        };
    }

    return {
        error: 'UNRESOLVABLE',
        step: 'STEP_3',
        detail: `digit count ${digits.length} (need 10 for local, or 91+10 / 1+10 patterns)`
    };
}

async function columnMemberContactE164Exists(db) {
    const [rows] = await db.execute(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'member'
           AND COLUMN_NAME = 'memberContactE164'`
    );
    return Number(rows[0]?.c) > 0;
}

async function loadMembersPendingMigration(db, limit) {
    let sql = `
        SELECT m.memberId,
               m.memberContact,
               l.country AS locationCountry
        FROM member m
        LEFT JOIN location l ON m.locationId = l.locationId
        WHERE m.memberContact IS NOT NULL
          AND TRIM(m.memberContact) <> ''
          AND m.memberContactE164 IS NULL
        ORDER BY m.memberId ASC
    `;
    const params = [];
    if (limit != null) {
        sql += ' LIMIT ?';
        params.push(limit);
    }
    const [rows] = await db.execute(sql, params);
    return rows;
}

function buildProposalsAndErrors(rows) {
    const errors = [];
    const proposed = [];

    let i = 0;
    for (const row of rows) {
        i += 1;
        const { memberId, memberContact: rawContact, locationCountry } = row;
        const result = normalizeMemberContactToE164(rawContact, locationCountry);

        if (result.skip) {
            continue;
        }
        if (result.error) {
            errors.push({
                memberId,
                rawContact,
                reason: result.error,
                step: result.step,
                detail: result.detail,
                locationCountry: locationCountry ?? null
            });
        } else if (result.e164) {
            proposed.push({
                memberId,
                rawContact,
                e164: result.e164,
                locationCountry: locationCountry ?? null
            });
        }

        if (i % PROGRESS_EVERY === 0) {
            console.log(`Processed ${i} / ${rows.length} row(s)…`);
        }
    }

    return { errors, proposed };
}

function partitionDuplicates(proposed) {
    const e164ToMemberIds = new Map();
    for (const p of proposed) {
        if (!e164ToMemberIds.has(p.e164)) {
            e164ToMemberIds.set(p.e164, []);
        }
        e164ToMemberIds.get(p.e164).push(p.memberId);
    }

    const duplicateGroups = [];
    const skipMemberIds = new Set();
    for (const [e164, memberIds] of e164ToMemberIds) {
        if (memberIds.length > 1) {
            duplicateGroups.push({
                e164,
                memberIds: [...memberIds].sort((a, b) => a - b)
            });
            for (const id of memberIds) {
                skipMemberIds.add(id);
            }
        }
    }
    return { duplicateGroups, skipMemberIds };
}

function writeJsonReports(duplicateGroups, errors) {
    fs.writeFileSync(OUT_DUPES, JSON.stringify(duplicateGroups, null, 2), 'utf8');
    console.log(`Wrote ${OUT_DUPES} (${duplicateGroups.length} duplicate E.164 group(s))`);

    fs.writeFileSync(OUT_ERRORS, JSON.stringify(errors, null, 2), 'utf8');
    console.log(`Wrote ${OUT_ERRORS} (${errors.length} UNRESOLVABLE row(s))`);
}

async function applyUpdates(db, proposed, skipMemberIds, dryRun) {
    const toWrite = proposed.filter((p) => !skipMemberIds.has(p.memberId));

    if (dryRun) {
        console.log(
            `[dry-run] Would UPDATE ${toWrite.length} row(s); ` +
            `skipped ${skipMemberIds.size} (duplicate E.164 collision)`
        );
        return 0;
    }

    if (toWrite.length === 0) {
        console.log('No rows to update.');
        return 0;
    }

    await db.beginTransaction();
    try {
        let updated = 0;
        for (const p of toWrite) {
            const [res] = await db.execute(
                `UPDATE member
                 SET memberContactE164 = ?
                 WHERE memberId = ?
                   AND memberContactE164 IS NULL`,
                [p.e164, p.memberId]
            );
            updated += res.affectedRows;
        }
        await db.commit();
        console.log(`memberContactE164 updated for ${updated} row(s).`);
        return updated;
    } catch (error) {
        await db.rollback();
        console.error('Transaction rolled back.');
        throw error;
    }
}

async function migratePhones() {
    await fetchSecrets();
    console.log("DB_CA_BASE64 exists:", !!process.env.DB_CA_BASE64);
    console.log("NODE_ENV:", process.env.NODE_ENV);

    const db = await require('../db').getConnection();
    console.log('Connected to database');

    const { dryRun, limit } = parseArgs(process.argv);
    console.log(`Starting member phone E.164 migration (dryRun=${dryRun}, limit=${limit ?? 'none'})`);

    try {
        const hasColumn = await columnMemberContactE164Exists(db);
        if (!hasColumn) {
            throw new Error(
                'member.memberContactE164 is missing — run scripts/sql-migration.sql Step 1 first.'
            );
        }

        const rows = await loadMembersPendingMigration(db, limit);
        console.log(`Found ${rows.length} member row(s) pending migration.`);

        const { errors, proposed } = buildProposalsAndErrors(rows);
        const { duplicateGroups, skipMemberIds } = partitionDuplicates(proposed);

        writeJsonReports(duplicateGroups, errors);

        await applyUpdates(db, proposed, skipMemberIds, dryRun);

        console.log('Member phone migration finished.');
    } catch (error) {
        console.error('Member phone migration failed:', error);
        throw error;
    } finally {
        db.release();
        console.log('Database connection released.');
    }
}

migratePhones().catch((err) => {
    console.error(err);
    process.exit(1);
});
