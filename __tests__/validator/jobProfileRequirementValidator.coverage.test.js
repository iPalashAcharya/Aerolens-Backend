const JobProfileRequirementValidator = require('../../validators/jobProfileRequirementValidator');

describe('JobProfileRequirementValidator middleware', () => {
    let next;
    let res;
    let execute;

    const futureCloseDate = () => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().slice(0, 10);
    };

    beforeEach(() => {
        next = jest.fn();
        res = {};
        execute = jest.fn().mockImplementation((sql) => {
            const s = String(sql);
            if (s.includes('FROM jobProfile WHERE')) {
                return Promise.resolve([[{ ok: 1 }]]);
            }
            if (s.includes('FROM location WHERE')) {
                return Promise.resolve([[{ locationId: 42 }]]);
            }
            if (s.includes('FROM lookup WHERE LOWER(value)')) {
                return Promise.resolve([[{ lookupKey: 'status-key' }]]);
            }
            if (s.includes('FROM lookup WHERE lookupKey')) {
                return Promise.resolve([[{ '1': 1 }]]);
            }
            return Promise.resolve([[]]);
        });

        const connection = {
            execute,
            release: jest.fn()
        };

        JobProfileRequirementValidator.init({
            getConnection: jest.fn().mockResolvedValue(connection)
        });
    });

    it('validateCreate passes with valid body and transforms lookups', async () => {
        const req = {
            body: {
                jobProfileId: 1,
                clientId: 2,
                departmentId: 3,
                positions: 2,
                estimatedCloseDate: futureCloseDate(),
                workArrangement: 'remote',
                location: { country: 'india', city: 'Mumbai' },
                status: 'pending'
            }
        };

        await JobProfileRequirementValidator.validateCreate(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(req.body.locationId).toBe(42);
        expect(req.body.statusId).toBe('status-key');
    });

    it('validateUpdate passes with id param and patch body', async () => {
        const req = {
            params: { id: '7' },
            body: { positions: 10 }
        };

        await JobProfileRequirementValidator.validateUpdate(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(req.body.positions).toBe(10);
    });

    it('validateDelete passes with valid id', () => {
        const req = { params: { id: '99' } };
        JobProfileRequirementValidator.validateDelete(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateGetById passes with valid id', () => {
        const req = { params: { id: '3' } };
        JobProfileRequirementValidator.validateGetById(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateSearch passes and maps status to statusId', async () => {
        const req = {
            query: { status: 'pending', limit: '10', offset: '0' }
        };

        await JobProfileRequirementValidator.validateSearch(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(req.validatedSearch.statusId).toBe('status-key');
    });
});
