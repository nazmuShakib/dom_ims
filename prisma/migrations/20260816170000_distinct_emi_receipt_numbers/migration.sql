-- Make installment receipt identifiers visibly distinct from EMI contract IDs.
UPDATE "emi_payments"
SET "receiptNumber" = regexp_replace("receiptNumber", '^EMIR-', 'RCPT-')
WHERE "receiptNumber" LIKE 'EMIR-%';

INSERT INTO "document_sequences" ("key", "value")
SELECT regexp_replace("key", '^EMIR:', 'RCPT:'), "value"
FROM "document_sequences"
WHERE "key" LIKE 'EMIR:%'
ON CONFLICT ("key") DO UPDATE
SET "value" = GREATEST("document_sequences"."value", EXCLUDED."value");

DELETE FROM "document_sequences" WHERE "key" LIKE 'EMIR:%';
