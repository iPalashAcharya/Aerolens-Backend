-- Composite index for audit log lookups by resource (resource_type + resource_id).
-- Covers every change-log dialog query; eliminates full table scans.
ALTER TABLE auditLogs
  ADD INDEX idx_resource_type_id (resource_type, resource_id);
