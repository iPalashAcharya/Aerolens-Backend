const AppError = require('../../utils/appError');
const LocationValidator = require('../../validators/locationValidator');
const VendorValidator = require('../../validators/vendorValidator');

describe('LocationValidator', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = { body: {}, params: {} };
        res = {};
        next = jest.fn();
    });

    it('validateCreate calls next', () => {
        req.body = { city: 'Pune', country: 'India', state: 'MH' };
        LocationValidator.validateCreate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateUpdate requires min one field', () => {
        req.body = { city: 'Mumbai' };
        LocationValidator.validateUpdate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateDelete validates params', () => {
        req.params = { locationId: '4' };
        LocationValidator.validateDelete(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateParams validates locationId', () => {
        req.params = { locationId: '8' };
        LocationValidator.validateParams(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });
});

describe('VendorValidator', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = { body: {}, params: {} };
        res = {};
        next = jest.fn();
    });

    it('validateCreate calls next', () => {
        req.body = { vendorName: 'Acme Staffing' };
        VendorValidator.validateCreate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateUpdate merges body and params', () => {
        req.params = { vendorId: '2' };
        req.body = { vendorEmail: 'v@vendor.com' };
        VendorValidator.validateUpdate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateDelete validates vendorId', () => {
        req.params = { vendorId: '6' };
        VendorValidator.validateDelete(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateUpdate throws AppError when params invalid', () => {
        req.params = {};
        req.body = { vendorName: 'Valid Vendor' };
        expect(() => VendorValidator.validateUpdate(req, res, next)).toThrow(AppError);
    });
});
