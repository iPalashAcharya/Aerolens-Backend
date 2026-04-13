const AppError = require('../../utils/appError');
const ContactValidator = require('../../validators/contactValidator');

describe('ContactValidator middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = { body: {}, params: {} };
        res = {};
        next = jest.fn();
    });

    it('validateCreate calls next on valid body', () => {
        req.body = {
            clientId: 1,
            contactPersonName: 'Sam',
            designation: 'Manager',
            phone: '+919876543210',
            email: 'sam@client.com'
        };
        ContactValidator.validateCreate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateCreate throws on invalid body', () => {
        req.body = { clientId: 1 };
        expect(() => ContactValidator.validateCreate(req, res, next)).toThrow(AppError);
    });

    it('validateUpdate merges body and params', () => {
        req.params = { contactId: '4' };
        req.body = { designation: 'Lead' };
        ContactValidator.validateUpdate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateDelete validates contactId', () => {
        req.params = { contactId: '9' };
        ContactValidator.validateDelete(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });
});
