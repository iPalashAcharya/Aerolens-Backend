function isPlainObject(value) {
    return (
        typeof value === 'object' &&
        value !== null &&
        Object.getPrototypeOf(value) === Object.prototype
    );
}

function removeUndefined(obj) {
    if (!isPlainObject(obj)) return;

    Object.keys(obj).forEach(key => {
        if (obj[key] === undefined) {
            delete obj[key];
        } else if (isPlainObject(obj[key])) {
            removeUndefined(obj[key]);

            // ⚠️ Do NOT delete empty objects
            // RFC 7396: empty object may be intentional
        }
    });
}

module.exports = { removeUndefined };