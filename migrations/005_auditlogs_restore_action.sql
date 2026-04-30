-- Add RESTORE to auditLogs.action ENUM.
-- Previously missing, causing restore actions to be stored as '' in non-strict mode.
ALTER TABLE auditLogs
  MODIFY COLUMN `action` ENUM('CREATE','UPDATE','DELETE','RESTORE') NOT NULL;
