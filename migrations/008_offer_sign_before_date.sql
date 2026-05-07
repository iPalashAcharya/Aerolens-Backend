-- Migration 008: Add sign_before_date column to the offer table.
-- Stores the acceptance deadline shown as <<Sign Before>> in the offer letter.
-- Run once per environment before deploying the document generation feature.

ALTER TABLE offer
    ADD COLUMN sign_before_date TIMESTAMP NULL AFTER doc_generated_by;
