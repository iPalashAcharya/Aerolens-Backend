const {
    transformToFrontend,
    transformToDatabase,
    fieldMappings,
} = require('../../utils/jobProfileFieldMapper');

describe('jobProfileFieldMapper', () => {
    it('transformToDatabase maps known frontend keys to DB columns', () => {
        const out = transformToDatabase({
            position: 'Engineer',
            overview: 'text',
        });

        expect(out.jobRole).toBe('Engineer');
        expect(out.jobOverview).toBe('text');
    });

    it('transformToDatabase returns null for null input', () => {
        expect(transformToDatabase(null)).toBeNull();
    });

    it('transformToFrontend maps DB keys to frontend and passes unknown keys through', () => {
        const out = transformToFrontend({
            jobRole: 'Dev',
            extraField: 1,
        });

        expect(out.position).toBe('Dev');
        expect(out.extraField).toBe(1);
    });

    it('transformToFrontend maps arrays element-wise', () => {
        const out = transformToFrontend([{ jobRole: 'A' }, { jobRole: 'B' }]);

        expect(out).toHaveLength(2);
        expect(out[0].position).toBe('A');
        expect(out[1].position).toBe('B');
    });

    it('transformToFrontend maps techSpecifications lookup rows', () => {
        const out = transformToFrontend({
            jobRole: 'X',
            techSpecifications: [{ lookupId: 10, value: 'React' }],
        });

        expect(out.techSpecifications[0]).toEqual({
            techSpecificationId: 10,
            techSpecificationName: 'React',
        });
    });

    it('transformToFrontend returns null for null input', () => {
        expect(transformToFrontend(null)).toBeNull();
    });

    it('exports fieldMappings with toDatabase and toFrontend', () => {
        expect(fieldMappings.toDatabase.position).toBe('jobRole');
        expect(fieldMappings.toFrontend.jobRole).toBe('position');
    });
});
