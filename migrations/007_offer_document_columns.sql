-- Migration 007: Add AI-generated document columns to the offer table.
-- Run once per environment before deploying the document generation feature.

ALTER TABLE offer
    ADD COLUMN doc_type         ENUM('offer_letter', 'service_agreement') NULL  AFTER codeOfConductSent,
    ADD COLUMN doc_file_name    VARCHAR(500)  NULL                               AFTER doc_type,
    ADD COLUMN doc_s3_key       VARCHAR(1000) NULL                               AFTER doc_file_name,
    ADD COLUMN doc_mime_type    VARCHAR(50)   NULL DEFAULT 'application/pdf'     AFTER doc_s3_key,
    ADD COLUMN doc_file_size    INT UNSIGNED  NULL                               AFTER doc_mime_type,
    ADD COLUMN doc_generated_at TIMESTAMP     NULL                               AFTER doc_file_size,
    ADD COLUMN doc_generated_by INT           NULL                               AFTER doc_generated_at;
