const AppError = require('../../utils/appError');
const MemberValidator = require('../../validators/memberValidator');

describe('MemberValidator middleware', () => {
    let next;
    let res;
    let execute;

    beforeEach(() => {
        next = jest.fn();
        res = {};
        execute = jest.fn().mockImplementation((sql) => {
            const s = String(sql);
            if (s.includes('FROM lookup WHERE lookupKey') && s.includes('designation')) {
                return Promise.resolve([[{ lookupKey: 'd1' }]]);
            }
            if (s.includes('FROM client WHERE clientId')) {
                return Promise.resolve([[{ clientId: 1 }]]);
            }
            if (s.includes('FROM location WHERE')) {
                return Promise.resolve([[{ locationId: 9 }]]);
            }
            if (s.includes('FROM lookup WHERE LOWER(value)') && s.includes('skill')) {
                return Promise.resolve([[{ lookupKey: 'sk1' }]]);
            }
            if (s.includes('FROM lookup WHERE lookupKey') && s.includes('skill')) {
                return Promise.resolve([[{ '1': 1 }]]);
            }
            return Promise.resolve([[]]);
        });

        const connection = { execute, release: jest.fn() };
        MemberValidator.init({
            getConnection: jest.fn().mockResolvedValue(connection)
        });
    });

    it('validateUpdate passes with memberName only', async () => {
        const req = {
            params: { memberId: '5' },
            body: { memberName: 'Updated Member' }
        };
        await MemberValidator.validateUpdate(req, res, next);
        expect(next).toHaveBeenCalledWith();
        expect(req.body.memberName).toBe('Updated Member');
    });

    it('validateUpdate maps designationId and location', async () => {
        const req = {
            params: { memberId: '5' },
            body: {
                designationId: 10,
                location: { city: 'Mumbai', country: 'india' }
            }
        };
        await MemberValidator.validateUpdate(req, res, next);
        expect(next).toHaveBeenCalledWith();
        expect(req.body.designation).toBe(10);
        expect(req.body.locationId).toBe(9);
    });

    it('validateDelete passes with valid memberId', () => {
        const req = { params: { memberId: '12' } };
        MemberValidator.validateDelete(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateDelete forwards AppError via next for invalid params', () => {
        const req = { params: {} };
        MemberValidator.validateDelete(req, res, next);
        expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });

    it('validateParams passes with valid memberId', () => {
        const req = { params: { memberId: '3' } };
        MemberValidator.validateParams(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });
});
