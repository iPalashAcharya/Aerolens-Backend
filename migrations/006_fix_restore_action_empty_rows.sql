-- Fix rows where RESTORE was written before migration 005 added RESTORE to the ENUM.
-- MySQL non-strict mode silently stored '' for the missing enum value.
-- Identify them by verb or summary since action='' is ambiguous.
UPDATE auditLogs
SET action = 'RESTORE'
WHERE action = ''
  AND (
    verb LIKE '%.restored'
    OR summary LIKE 'Restored %'
  );
