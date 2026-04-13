const AppError = require('../../utils/appError');
const OfferValidator = require('../../validators/offerValidator');

describe('OfferValidator middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = { body: {} };
        res = {};
        next = jest.fn();
    });

    const validCreate = () => ({
        jobProfileRequirementId: 1,
        reportingManagerId: 2,
        employmentTypeLookupId: 3,
        workModelLookupId: 4,
        joiningDate: '2026-06-01',
        ndaSent: true,
        codeOfConductSent: false
    });

    it('validateCreate calls next on valid body', () => {
        req.body = validCreate();
        OfferValidator.validateCreate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateCreate throws AppError when invalid', () => {
        req.body = { ...validCreate(), joiningDate: 'bad' };
        expect(() => OfferValidator.validateCreate(req, res, next)).toThrow(AppError);
    });

    it('validateTerminate calls next', () => {
        req.body = { terminationDate: '2026-01-15', terminationReason: 'role eliminated' };
        OfferValidator.validateTerminate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateRevision calls next when newCTC provided', () => {
        req.body = { newCTC: 100000, reason: 'market correction' };
        OfferValidator.validateRevision(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateStatusUpdate for REJECTED', () => {
        req.body = {
            status: 'REJECTED',
            decisionDate: '2026-02-01',
            rejectionReason: 'declined'
        };
        OfferValidator.validateStatusUpdate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateStatusUpdate for ACCEPTED with signed flags', () => {
        req.body = {
            status: 'ACCEPTED',
            decisionDate: '2026-02-01',
            signedNDAReceived: true,
            signedCodeOfConductReceived: true
        };
        OfferValidator.validateStatusUpdate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });
});
