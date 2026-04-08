-- RBAC migration rollback (down)
-- Date: 2026-04-07
-- Target: MySQL 8+

SET @db_name := DATABASE();

-- Drop FKs first (if created by RBAC migration)
SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_schema = @db_name
              AND table_name = 'member'
              AND constraint_name = 'fk_member_role'
              AND constraint_type = 'FOREIGN KEY'
        ),
        'ALTER TABLE `member` DROP FOREIGN KEY `fk_member_role`',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_schema = @db_name
              AND table_name = 'candidate'
              AND constraint_name = 'fk_candidate_assignedRecruiter'
              AND constraint_type = 'FOREIGN KEY'
        ),
        'ALTER TABLE `candidate` DROP FOREIGN KEY `fk_candidate_assignedRecruiter`',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_schema = @db_name
              AND table_name = 'interview'
              AND constraint_name = 'fk_interview_interviewer'
              AND constraint_type = 'FOREIGN KEY'
        ),
        'ALTER TABLE `interview` DROP FOREIGN KEY `fk_interview_interviewer`',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop indexes added by RBAC migration
SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.statistics
            WHERE table_schema = @db_name
              AND table_name = 'member'
              AND index_name = 'idx_member_roleId'
        ),
        'ALTER TABLE `member` DROP INDEX `idx_member_roleId`',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.statistics
            WHERE table_schema = @db_name
              AND table_name = 'candidate'
              AND index_name = 'idx_candidate_assignedRecruiterId'
        ),
        'ALTER TABLE `candidate` DROP INDEX `idx_candidate_assignedRecruiterId`',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.statistics
            WHERE table_schema = @db_name
              AND table_name = 'interview'
              AND index_name = 'idx_interview_interviewerId'
        ),
        'ALTER TABLE `interview` DROP INDEX `idx_interview_interviewerId`',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop columns only if they were tagged as RBAC-added
SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'member'
              AND column_name = 'roleId'
              AND column_comment = 'rbac_added'
        ),
        'ALTER TABLE `member` DROP COLUMN `roleId`',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'candidate'
              AND column_name = 'assignedRecruiterId'
              AND column_comment = 'rbac_added'
        ),
        'ALTER TABLE `candidate` DROP COLUMN `assignedRecruiterId`',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'interview'
              AND column_name = 'interviewerId'
              AND column_comment = 'rbac_added'
        ),
        'ALTER TABLE `interview` DROP COLUMN `interviewerId`',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop RBAC tables
DROP TABLE IF EXISTS `role_module_permission`;
DROP TABLE IF EXISTS `module`;
DROP TABLE IF EXISTS `role`;

