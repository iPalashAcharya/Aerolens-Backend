-- RBAC migration (up)
-- Date: 2026-04-07
-- Target: MySQL 8+

SET @db_name := DATABASE();

CREATE TABLE IF NOT EXISTS `role` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `briefPurpose` VARCHAR(255) DEFAULT NULL,
    `permissionVersion` INT NOT NULL DEFAULT 1,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_role_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `module` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `displayName` VARCHAR(150) NOT NULL,
    `sortOrder` INT NOT NULL DEFAULT 0,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_module_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `role_module_permission` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `roleId` INT NOT NULL,
    `moduleId` INT NOT NULL,
    `canView` TINYINT(1) NOT NULL DEFAULT 0,
    `canAdd` TINYINT(1) NOT NULL DEFAULT 0,
    `canEdit` TINYINT(1) NOT NULL DEFAULT 0,
    `canDelete` TINYINT(1) NOT NULL DEFAULT 0,
    `canFinalizeResult` TINYINT(1) NOT NULL DEFAULT 0,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_role_module` (`roleId`, `moduleId`),
    KEY `idx_rmp_role` (`roleId`),
    KEY `idx_rmp_module` (`moduleId`),
    CONSTRAINT `fk_rmp_role` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_rmp_module` FOREIGN KEY (`moduleId`) REFERENCES `module` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- member.roleId (nullable initially)
SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'member'
              AND column_name = 'roleId'
        ),
        'SELECT 1',
        'ALTER TABLE `member` ADD COLUMN `roleId` INT NULL COMMENT ''rbac_added'' AFTER `designation`'
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
              AND table_name = 'member'
              AND index_name = 'idx_member_roleId'
        ),
        'SELECT 1',
        'ALTER TABLE `member` ADD INDEX `idx_member_roleId` (`roleId`)'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.key_column_usage
            WHERE table_schema = @db_name
              AND table_name = 'member'
              AND column_name = 'roleId'
              AND referenced_table_name = 'role'
              AND referenced_column_name = 'id'
        ),
        'SELECT 1',
        'ALTER TABLE `member` ADD CONSTRAINT `fk_member_role` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON UPDATE CASCADE ON DELETE SET NULL'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- candidate.assignedRecruiterId
SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = @db_name
              AND table_name = 'candidate'
        ),
        'SELECT 1',
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
        ),
        'SELECT 1',
        'ALTER TABLE `candidate` ADD COLUMN `assignedRecruiterId` INT NULL COMMENT ''rbac_added'' AFTER `recruiterId`'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill from existing recruiter linkage if column exists
SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'candidate'
              AND column_name = 'assignedRecruiterId'
        ),
        'UPDATE `candidate` SET `assignedRecruiterId` = `recruiterId` WHERE `assignedRecruiterId` IS NULL',
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
        'SELECT 1',
        'ALTER TABLE `candidate` ADD INDEX `idx_candidate_assignedRecruiterId` (`assignedRecruiterId`)'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.key_column_usage
            WHERE table_schema = @db_name
              AND table_name = 'candidate'
              AND column_name = 'assignedRecruiterId'
              AND referenced_table_name = 'member'
              AND referenced_column_name = 'memberId'
        ),
        'SELECT 1',
        'ALTER TABLE `candidate` ADD CONSTRAINT `fk_candidate_assignedRecruiter` FOREIGN KEY (`assignedRecruiterId`) REFERENCES `member` (`memberId`) ON UPDATE CASCADE ON DELETE SET NULL'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- interview.interviewerId (if missing in older schemas)
SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'interview'
              AND column_name = 'interviewerId'
        ),
        'SELECT 1',
        'ALTER TABLE `interview` ADD COLUMN `interviewerId` INT NULL COMMENT ''rbac_added'' AFTER `candidateId`'
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
        'SELECT 1',
        'ALTER TABLE `interview` ADD INDEX `idx_interview_interviewerId` (`interviewerId`)'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.key_column_usage
            WHERE table_schema = @db_name
              AND table_name = 'interview'
              AND column_name = 'interviewerId'
              AND referenced_table_name = 'member'
              AND referenced_column_name = 'memberId'
        ),
        'SELECT 1',
        'ALTER TABLE `interview` ADD CONSTRAINT `fk_interview_interviewer` FOREIGN KEY (`interviewerId`) REFERENCES `member` (`memberId`) ON UPDATE CASCADE ON DELETE SET NULL'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Seed roles
INSERT INTO `role` (`name`, `briefPurpose`)
VALUES
    ('HR', 'Manages users, permissions, and full hiring workflow'),
    ('Admin', 'System administrator with full control'),
    ('Recruiter', 'Manages candidate sourcing and progress'),
    ('Interviewer', 'Handles interview execution and evaluation'),
    ('User', 'Default application role')
ON DUPLICATE KEY UPDATE
    `briefPurpose` = VALUES(`briefPurpose`),
    `updatedAt` = CURRENT_TIMESTAMP;

-- Seed modules (derived from mounted route groups + RBAC module)
INSERT INTO `module` (`name`, `displayName`, `sortOrder`)
VALUES
    ('home', 'Home', 10),
    ('candidate', 'Resume/Candidate', 20),
    ('jobProfile', 'Job Profile', 30),
    ('interview', 'Interview', 40),
    ('jobProfileRequirement', 'Job Profile Requirement', 50),
    ('member', 'Members', 60),
    ('vendor', 'Vendor', 70),
    ('rbac', 'RBAC', 80),
    ('client', 'Client', 90),
    ('department', 'Department', 100),
    ('contact', 'Contact', 110),
    ('location', 'Location', 120),
    ('lookup', 'Lookup', 130),
    ('offer', 'Offer', 140),
    ('report', 'Reports', 150)
ON DUPLICATE KEY UPDATE
    `displayName` = VALUES(`displayName`),
    `sortOrder` = VALUES(`sortOrder`),
    `updatedAt` = CURRENT_TIMESTAMP;

-- Backfill member.roleId from legacy flags/designation
UPDATE `member` m
LEFT JOIN `lookup` l
    ON l.lookupKey = m.designation
SET m.roleId = CASE
    WHEN LOWER(COALESCE(l.value, '')) = 'admin'
        THEN (SELECT id FROM `role` WHERE `name` = 'Admin' LIMIT 1)
    WHEN LOWER(COALESCE(l.value, '')) IN ('hr', 'human resources')
        THEN (SELECT id FROM `role` WHERE `name` = 'HR' LIMIT 1)
    WHEN m.isRecruiter = TRUE
        THEN (SELECT id FROM `role` WHERE `name` = 'Recruiter' LIMIT 1)
    WHEN m.isInterviewer = TRUE
        THEN (SELECT id FROM `role` WHERE `name` = 'Interviewer' LIMIT 1)
    ELSE (SELECT id FROM `role` WHERE `name` = 'User' LIMIT 1)
END
WHERE m.roleId IS NULL;

-- Seed full permissions initially (prevents accidental lockout during rollout)
INSERT INTO `role_module_permission` (
    `roleId`, `moduleId`, `canView`, `canAdd`, `canEdit`, `canDelete`, `canFinalizeResult`
)
SELECT
    r.id AS roleId,
    m.id AS moduleId,
    TRUE AS canView,
    TRUE AS canAdd,
    TRUE AS canEdit,
    TRUE AS canDelete,
    CASE WHEN m.name = 'interview' THEN TRUE ELSE FALSE END AS canFinalizeResult
FROM `role` r
CROSS JOIN `module` m
ON DUPLICATE KEY UPDATE
    `canView` = VALUES(`canView`),
    `canAdd` = VALUES(`canAdd`),
    `canEdit` = VALUES(`canEdit`),
    `canDelete` = VALUES(`canDelete`),
    `canFinalizeResult` = VALUES(`canFinalizeResult`),
    `updatedAt` = CURRENT_TIMESTAMP;

-- Restrict RBAC administration to HR/Admin by default
UPDATE `role_module_permission` rmp
INNER JOIN `role` r
    ON r.id = rmp.roleId
INNER JOIN `module` m
    ON m.id = rmp.moduleId
SET
    rmp.canView = FALSE,
    rmp.canAdd = FALSE,
    rmp.canEdit = FALSE,
    rmp.canDelete = FALSE
WHERE
    m.name = 'rbac'
    AND r.name NOT IN ('HR', 'Admin');

