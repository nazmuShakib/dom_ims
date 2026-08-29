-- Rebalance existing, completely unpaid EMI schedules into whole-taka amounts.
-- Contracts with any collected payment or a fractional-taka total are left unchanged.
WITH eligible AS (
  SELECT
    "contractId",
    COUNT(*)::BIGINT AS term_count,
    SUM("amountDue")::BIGINT AS total_paisa
  FROM "emi_installments"
  GROUP BY "contractId"
  HAVING SUM("amountPaid") = 0
    AND MOD(SUM("amountDue"), 100) = 0
),
ranked AS (
  SELECT
    installment."id",
    ROW_NUMBER() OVER (
      PARTITION BY installment."contractId"
      ORDER BY installment."sequence"
    )::BIGINT AS installment_position,
    eligible.term_count,
    eligible.total_paisa / 100 AS total_taka
  FROM "emi_installments" AS installment
  INNER JOIN eligible ON eligible."contractId" = installment."contractId"
)
UPDATE "emi_installments" AS installment
SET "amountDue" = (
  (
    ranked.total_taka / ranked.term_count
    + CASE
        WHEN ranked.installment_position <= MOD(ranked.total_taka, ranked.term_count) THEN 1
        ELSE 0
      END
  ) * 100
)::INTEGER
FROM ranked
WHERE installment."id" = ranked."id";
