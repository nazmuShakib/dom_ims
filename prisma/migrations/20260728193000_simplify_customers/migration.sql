ALTER TABLE "customers"
  DROP COLUMN "email",
  DROP COLUMN "address",
  DROP COLUMN "note";

ALTER TABLE "sales"
  DROP COLUMN "customerEmail",
  DROP COLUMN "customerAddress";
