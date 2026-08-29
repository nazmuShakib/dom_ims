-- Better Auth phone-number identifiers. Existing users are backfilled by the
-- one-time `npm run auth:migrate-mobile` script after this migration is applied.
ALTER TABLE "users"
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "phoneNumberVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");
