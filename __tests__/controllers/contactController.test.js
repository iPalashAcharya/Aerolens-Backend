const ContactController = require('../../controllers/contactController');

describe('ContactController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            createContact: jest.fn(),
            updateContact: jest.fn(),
            deleteContact: jest.fn(),
        };
        controller = new ContactController(mockService);
        req = { params: {}, body: {}, auditContext: {} };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    });

    it('createContact returns 201', async () => {
        mockService.createContact.mockResolvedValue({ id: 1 });

        await controller.createContact(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('updateContact passes contactId from params', async () => {
        req.params.contactId = '4';
        mockService.updateContact.mockResolvedValue({});

        await controller.updateContact(req, res);

        expect(mockService.updateContact).toHaveBeenCalledWith(4, req.body, req.auditContext);
    });
});
