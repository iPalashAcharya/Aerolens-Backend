const ClientController = require('../../controllers/clientController');

describe('ClientController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            getAllClients: jest.fn(),
            getAllClientsWithDepartment: jest.fn(),
            getClientById: jest.fn(),
            createClient: jest.fn(),
            updateClient: jest.fn(),
            deleteClient: jest.fn(),
        };
        controller = new ClientController(mockService);
        req = { params: {}, body: {}, auditContext: {} };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
    });

    it('getAllClients sends success with data', async () => {
        mockService.getAllClients.mockResolvedValue({ data: [{ id: 1 }] });

        await controller.getAllClients(req, res);

        expect(mockService.getAllClients).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
    });

    it('getClient passes id from params', async () => {
        req.params.id = '5';
        mockService.getClientById.mockResolvedValue({ clientId: 5 });

        await controller.getClient(req, res);

        expect(mockService.getClientById).toHaveBeenCalledWith(5);
    });

    it('createClient passes body and auditContext', async () => {
        req.body = { name: 'N' };
        req.auditContext = { userId: 1 };
        mockService.createClient.mockResolvedValue({ clientId: 1 });

        await controller.createClient(req, res);

        expect(mockService.createClient).toHaveBeenCalledWith(req.body, req.auditContext);
    });

    it('deleteClient calls service', async () => {
        req.params.id = '3';
        mockService.deleteClient.mockResolvedValue(undefined);

        await controller.deleteClient(req, res);

        expect(mockService.deleteClient).toHaveBeenCalledWith(3, req.auditContext);
    });
});
