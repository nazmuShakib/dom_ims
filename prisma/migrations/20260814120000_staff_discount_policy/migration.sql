CREATE TABLE "shop_policy" (
    "id" TEXT NOT NULL DEFAULT 'shop',
    "staffMaxDiscount" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_policy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shop_policy_staffMaxDiscount_nonnegative" CHECK ("staffMaxDiscount" >= 0)
);

INSERT INTO "shop_policy" ("id", "staffMaxDiscount", "updatedAt")
VALUES ('shop', 0, CURRENT_TIMESTAMP);
