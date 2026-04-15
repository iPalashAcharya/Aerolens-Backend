const { buildAuditFieldDiff } = require('../../utils/auditDiff');

describe('auditDiff', () => {
    it('returns empty array when both sides empty', () => {
        expect(buildAuditFieldDiff({}, {})).toEqual([]);
    });

    it('detects changed scalar fields', () => {
        const changes = buildAuditFieldDiff({ a: 1, b: 2 }, { a: 1, b: 3 });
        expect(changes).toEqual([{ field: 'b', oldValue: 2, newValue: 3 }]);
    });

    it('parses JSON strings', () => {
        const changes = buildAuditFieldDiff('{"x":1}', '{"x":2}');
        expect(changes).toEqual([{ field: 'x', oldValue: 1, newValue: 2 }]);
    });
});
