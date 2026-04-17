const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');
const AppError = require('../utils/appError');
const auditLogService = require('../services/auditLogService');

class AuditLogController {
    /**
     * GET /audit-logs — paginated list (Phase 2).
     * Query: page, pageSize, dateFrom, dateTo, userId, resourceType, resourceId,
     *        action, verb, search, includeDiff (true for UPDATE fieldChanges)
     */
    list = catchAsync(async (req, res) => {
        const data = await auditLogService.listAuditLogs(req.query);
        return ApiResponse.success(res, data, 'Audit logs retrieved successfully');
    });

    /**
     * GET /audit-logs/:id — single entry (Phase 2 + optional diff Phase 3).
     * Query: includeDiff=true
     */
    getById = catchAsync(async (req, res) => {
        const id = req.params.id;
        if (id == null || String(id).trim() === '') {
            throw new AppError('Audit log id is required', 400, 'INVALID_AUDIT_LOG_ID');
        }

        const row = await auditLogService.getAuditLogById(id, {
            includeDiff: req.query.includeDiff === 'true' || req.query.includeDiff === '1'
        });

        if (!row) {
            throw new AppError('Audit log entry not found', 404, 'AUDIT_LOG_NOT_FOUND');
        }

        return ApiResponse.success(res, row, 'Audit log entry retrieved successfully');
    });
}

module.exports = new AuditLogController();
