-- Soft delete columns for non-client modules
-- Applies to: Job Profile, Job Profile Requirement, Member, Lookup, Vendor module tables.

ALTER TABLE `jobProfile`
    ADD COLUMN IF NOT EXISTS `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME NULL;

ALTER TABLE `jobProfileRequirement`
    ADD COLUMN IF NOT EXISTS `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME NULL;

ALTER TABLE `member`
    ADD COLUMN IF NOT EXISTS `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME NULL;

ALTER TABLE `lookup`
    ADD COLUMN IF NOT EXISTS `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME NULL;

-- Vendor module table in the current backend schema.
ALTER TABLE `recruitmentVendor`
    ADD COLUMN IF NOT EXISTS `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME NULL;
