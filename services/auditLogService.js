const auditLogRepository = require('../repositories/auditLogsRepository');

class AuditLogService {
    async logAction(auditData, connection) {
        const formattedTimestamp = auditData.timestamp
            ? auditData.timestamp.toISOString().slice(0, 19).replace('T', ' ')
            : null;
        console.log({
            userId: auditData.userId,
            action: auditData.action,
            oldValues: auditData.oldValues ? JSON.stringify(auditData.oldValues) : null,
            newValues: auditData.newValues ? JSON.stringify(auditData.newValues) : null,
            ipAddress: auditData.ipAddress,
            userAgent: auditData.userAgent,
            timestamp: formattedTimestamp,
            reason: auditData.reason ? JSON.stringify(auditData.reason) : null
        });
        return await auditLogRepository.create({
            userId: auditData.userId,
            action: auditData.action,
            oldValues: auditData.oldValues ? JSON.stringify(auditData.oldValues) : null,
            newValues: auditData.newValues ? JSON.stringify(auditData.newValues) : null,
            ipAddress: auditData.ipAddress,
            userAgent: auditData.userAgent,
            timestamp: formattedTimestamp,
            reason: auditData.reason ? JSON.stringify(auditData.reason) : null
        }, connection);
    }
}

module.exports = new AuditLogService();