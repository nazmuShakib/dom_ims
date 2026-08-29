ALTER TABLE "users"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';

ALTER TABLE "users"
  ADD CONSTRAINT "users_locale_supported" CHECK ("locale" IN ('en', 'bn'));
