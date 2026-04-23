-- Soft delete columns for Candidate (Resume), Interview modules.
-- Offer table already has isDeleted + deletedAt — no changes needed there.

-- ============================================================
-- 1. CANDIDATE table
--    Currently uses isActive=FALSE for soft delete.
--    Adding is_deleted + deleted_at to match vendor/jobProfile pattern.
-- ============================================================
ALTER TABLE `candidate`
    ADD COLUMN IF NOT EXISTS `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME NULL;

-- Backfill existing soft-deleted candidates
UPDATE `candidate`
SET `is_deleted` = 1, `deleted_at` = UTC_TIMESTAMP()
WHERE `isActive` = FALSE AND `is_deleted` = 0;

-- ============================================================
-- 2. INTERVIEW table
--    Already has deletedAt (camelCase) and isActive.
--    Adding is_deleted for consistency.
-- ============================================================
ALTER TABLE `interview`
    ADD COLUMN IF NOT EXISTS `is_deleted` TINYINT(1) NOT NULL DEFAULT 0;

-- Backfill existing soft-deleted interviews
UPDATE `interview`
SET `is_deleted` = 1
WHERE `deletedAt` IS NOT NULL AND `is_deleted` = 0;

-- ============================================================
-- 3. OFFER table — NO CHANGES REQUIRED
--    Already has: isDeleted TINYINT, deletedAt DATETIME
-- ============================================================
