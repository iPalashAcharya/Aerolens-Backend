const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class ClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }

    getAllClients = catchAsync(async (req, res) => {
        try {
            /*const options = {
                limit: parseInt(req.query.limit) || 10,
                page: parseInt(req.query.page) || 1
            };*/
            const result = await this.clientService.getAllClients();

            return ApiResponse.success(
                res,
                result.data,
                'Clients retrieved successfully',
                200,
                //result.pagination
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
        const result = await this.clientService.deleteClient(parseInt(req.params.id), req.auditContext);

        return ApiResponse.success(
            res,
            result.data,
            result.message
        );
    });

    getClientAuditLogsById = catchAsync(async (req, res) => {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const result = await this.clientService.getClientAuditLogsById(parseInt(req.params.clientId, 10), page, limit);
        return res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination,
        });
    });

    restoreClient = catchAsync(async (req, res) => {
        const result = await this.clientService.restoreClient(parseInt(req.params.id), req.auditContext);
        return ApiResponse.success(res, result.data, result.message);
    });

    getDeletedClients = catchAsync(async (req, res) => {
        const result = await this.clientService.getDeletedClients();
        return res.status(200).json({
            success: true,
            data: result.data,
        });
    });
}

module.exports = ClientController;
