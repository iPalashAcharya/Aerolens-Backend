function removeNulls(obj) {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach(key => {
        if (obj[key] === null) {
            delete obj[key];
        } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            removeNulls(obj[key]);
            if (Object.keys(obj[key]).length === 0) {
                delete obj[key];
            }
        }
    });
}

module.exports = { removeNulls };
