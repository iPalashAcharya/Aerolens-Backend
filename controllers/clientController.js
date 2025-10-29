const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class ClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }

    getAllClients = catchAsync(async (req, res) => {
        try {
            const options = {
                limit: parseInt(req.query.limit) || 10,
                page: parseInt(req.query.page) || 1
            };
            const result = await this.clientService.getAllClients(options);

            return ApiResponse.success(
                res,
                result.data,
                'Clients retrieved successfully',
                200,
                result.pagination  // Pass pagination as meta
            );
        } catch (error) {
            return ApiResponse.error(res, error)
        }
    });

    getAllClientsWithDepartment = catchAsync(async (req, res) => {
        const clients = await this.clientService.getAllClientsWithDepartment();
        return ApiResponse.success(
            res,
            clients,
            'Clients with departments retrieved successfully'
        );
    });

    getClient = catchAsync(async (req, res) => {
        const client = await this.clientService.getClientById(
            parseInt(req.params.id)
        );

        return ApiResponse.success(
            res,
            client,
            'Client retrieved successfully'
        );
    });

    createClient = catchAsync(async (req, res) => {
        const client = await this.clientService.createClient(req.body, req.auditContext);

        return ApiResponse.success(
            res,
            client,
            'client created successfully',
            201
        );
    });

    updateClient = catchAsync(async (req, res) => {
        const client = await this.clientService.updateClient(
            parseInt(req.params.id),
            req.body,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            client,
            'client details updated successfully'
        );
    });

    deleteClient = catchAsync(async (req, res) => {
        await this.clientService.deleteClient(parseInt(req.params.id), req.auditContext);

        return ApiResponse.success(
            res,
            null,
            'Client deleted successfully'
        );
    });
}

module.exports = ClientController;