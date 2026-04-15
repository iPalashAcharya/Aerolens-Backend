/**
 * Shallow field-level diff for audit old_values / new_values (Phase 3).
 * Nested objects/arrays are compared via JSON.stringify (stable enough for display).
 */

function normalizeForCompare(value) {
    if (value === undefined) return null;
    if (value !== null && typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return value;
}

/**
 * @param {object|string|null} oldValues - parsed object or JSON string
 * @param {object|string|null} newValues
 * @returns {{ field: string, oldValue: *, newValue: * }[]}
 */
function buildAuditFieldDiff(oldValues, newValues) {
    let oldObj = oldValues;
    let newObj = newValues;

    if (typeof oldObj === 'string') {
        try {
            oldObj = oldObj ? JSON.parse(oldObj) : {};
        } catch {
            oldObj = {};
        }
    }
    if (typeof newObj === 'string') {
        try {
            newObj = newObj ? JSON.parse(newObj) : {};
        } catch {
            newObj = {};
        }
    }

    if (!oldObj || typeof oldObj !== 'object') oldObj = {};
    if (!newObj || typeof newObj !== 'object') newObj = {};

    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    const changes = [];

    for (const field of keys) {
        const o = normalizeForCompare(oldObj[field]);
        const n = normalizeForCompare(newObj[field]);
        if (o !== n) {
            changes.push({
                field,
                oldValue: oldObj[field] !== undefined ? oldObj[field] : null,
                newValue: newObj[field] !== undefined ? newObj[field] : null
            });
        }
    }

    return changes;
}

module.exports = { buildAuditFieldDiff, normalizeForCompare };
