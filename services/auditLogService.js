const auditLogRepository = require('../repositories/auditLogsRepository');
const { buildAuditFieldDiff } = require('../utils/auditDiff');

function toMysqlLocalTimestamp(date) {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** UTC DATETIME(3) for occurred_at_utc column */
function toMysqlUtcDatetime3(date) {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    const iso = d.toISOString();
    return iso.replace('T', ' ').replace('Z', '').slice(0, 23);
}

function normalizeResourceType(auditData) {
    const rt = auditData.resource_type ?? auditData.resourceType ?? auditData.entityType;
    if (rt == null || rt === '') return null;
    return String(rt).toLowerCase().replace(/\s+/g, '_');
}

function normalizeResourceId(auditData) {
    const rid = auditData.resource_id ?? auditData.resourceId ?? auditData.entityId;
    if (rid == null || rid === '') return null;
    return String(rid);
}

function inferVerb(action, resourceType) {
    const rt = resourceType || 'record';
    switch (action) {
        case 'CREATE':
            return `${rt}.created`;
        case 'UPDATE':
            return `${rt}.updated`;
        case 'DELETE':
            return `${rt}.deleted`;
        case 'BULK_CANDIDATE_UPLOAD':
            return 'candidate.bulk_imported';
        case 'BULK_UPDATE':
            return `${rt}.bulk_updated`;
        default:
            return null;
    }
}

function inferSummary(action, resourceType, resourceId, explicitSummary) {
    if (explicitSummary) return String(explicitSummary).slice(0, 512);
    const rt = resourceType || 'record';
    const idPart = resourceId ? ` #${resourceId}` : '';
    switch (action) {
        case 'CREATE':
            return `Created ${rt}${idPart}`.slice(0, 512);
        case 'UPDATE':
            return `Updated ${rt}${idPart}`.slice(0, 512);
        case 'DELETE':
            return `Deleted ${rt}${idPart}`.slice(0, 512);
        case 'BULK_CANDIDATE_UPLOAD':
            return 'Bulk candidate upload completed'.slice(0, 512);
        case 'BULK_UPDATE':
            return `Bulk update: ${rt}`.slice(0, 512);
        default:
            return null;
    }
}

class AuditLogService {
    async logAction(auditData, connection) {
        const oldRaw = auditData.oldValues ?? auditData.previousValues ?? null;
        const newRaw = auditData.newValues ?? null;

        let resourceType = normalizeResourceType(auditData);
        let resourceId = normalizeResourceId(auditData);
        if (
            !resourceType &&
            newRaw &&
            typeof newRaw === 'object' &&
            newRaw.entityType != null &&
            newRaw.entityType !== ''
        ) {
            resourceType = String(newRaw.entityType).toLowerCase().replace(/\s+/g, '_');
        }
        if (
            !resourceId &&
            newRaw &&
            typeof newRaw === 'object' &&
            newRaw.entityId != null &&
            newRaw.entityId !== ''
        ) {
            resourceId = String(newRaw.entityId);
        }

        const oldValues = oldRaw != null ? JSON.stringify(oldRaw) : null;
        const newValues = newRaw != null ? JSON.stringify(newRaw) : null;
        const reason =
            auditData.reason != null ? JSON.stringify(auditData.reason) : null;

        const ts = auditData.timestamp ? new Date(auditData.timestamp) : null;
        const formattedTimestamp = toMysqlLocalTimestamp(ts);
        const occurredAtUtc = toMysqlUtcDatetime3(ts);

        const verbFinal = auditData.verb || inferVerb(auditData.action, resourceType);

        const summary = inferSummary(
            auditData.action,
            resourceType,
            resourceId,
            auditData.summary
        );

        const httpMethod = auditData.httpMethod ?? auditData.method ?? null;
        const httpPath = auditData.httpPath ?? auditData.path ?? null;

        if (process.env.DEBUG_AUDIT === '1') {
            // eslint-disable-next-line no-console
            console.log('[audit]', {
                userId: auditData.userId,
                action: auditData.action,
                resourceType,
                verb: verbFinal
            });
        }

        return await auditLogRepository.create(
            {
                userId: auditData.userId,
                action: auditData.action,
                resourceType,
                resourceId,
                verb: verbFinal,
                summary: summary ? String(summary).slice(0, 512) : null,
                oldValues,
                newValues,
                ipAddress: auditData.ipAddress,
                userAgent: auditData.userAgent,
                httpMethod,
                httpPath,
                reason,
                timestamp: formattedTimestamp,
                occurredAtUtc
            },
            connection
        );
    }

    /**
     * List audit entries (Phase 2 + Phase 3 fieldDiff on demand via includeDiff).
     */
    async listAuditLogs(query = {}) {
        const {
            dateFrom,
            dateTo,
            userId,
            resourceType,
            resourceId,
            action,
            verb,
            search,
            page,
            pageSize,
            includeDiff
        } = query;

        const { rows, total, page: p, pageSize: ps } = await auditLogRepository.findMany({
            dateFrom,
            dateTo,
            userId,
            resourceType,
            resourceId,
            action,
            verb,
            search,
            page,
            pageSize
        });

        const data = rows.map((row) => this._mapRowToDto(row, includeDiff === true || includeDiff === 'true'));

        return {
            items: data,
            meta: {
                total,
                page: p,
                pageSize: ps,
                totalPages: Math.ceil(total / ps) || 0
            }
        };
    }

    async getAuditLogById(id, options = {}) {
        const row = await auditLogRepository.findById(id);
        if (!row) return null;
        return this._mapRowToDto(row, options.includeDiff === true);
    }

    _mapRowToDto(row, includeDiff) {
        const oldValues = AuditLogService._parseJsonColumn(row.old_values);
        const newValues = AuditLogService._parseJsonColumn(row.new_values);
        const reason = AuditLogService._parseJsonColumn(row.reason);

        const occurredAt =
            row.occurred_at_utc != null
                ? new Date(row.occurred_at_utc).toISOString()
                : row.timestamp != null
                  ? new Date(row.timestamp).toISOString()
                  : null;

        const dto = {
            id: String(row.id),
            occurredAt,
            action: row.action,
            verb: row.verb,
            summary: row.summary,
            resourceType: row.resource_type,
            resourceId: row.resource_id,
            actor: {
                memberId: row.user_id,
                name: row.actor_name ?? null,
                email: row.actor_email ?? null
            },
            request: {
                method: row.http_method,
                path: row.http_path
            },
            client: {
                ipAddress: row.ip_address,
                userAgent: row.user_agent
            },
            oldValues,
            newValues,
            reason
        };

        if (includeDiff && row.action === 'UPDATE') {
            dto.fieldChanges = buildAuditFieldDiff(oldValues, newValues);
        } else {
            dto.fieldChanges = undefined;
        }

        return dto;
    }

    static _parseJsonColumn(val) {
        if (val == null) return null;
        if (typeof val === 'object') return val;
        try {
            return JSON.parse(val);
        } catch {
            return val;
        }
    }
}

module.exports = new AuditLogService();
