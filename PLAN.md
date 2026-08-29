# Electronics Shop — Inventory Management System (IMS)
### Development Plan & Technical Specification — v2

> **Purpose:** A complete build spec for an AI coding assistant (Claude Code, Cursor) to develop from. Save as `PLAN.md` in the project root and reference it in prompts.
>
> **What changed from v1:** This revision is rebuilt around three scoping decisions that v1 got wrong (it was written before they were made):
> 1. **No full POS in v1.** Sales are initially ledger movements, not checkout documents. Phase 8 deliberately adds a limited cart and invoice workflow without cash-drawer, terminal, shift, loyalty, or payment-processing machinery.
> 2. **Serial/IMEI tracking is Phase 1, not Phase 2.** It is a core schema concept, not an enhancement.
> 3. **`currentStock` is no longer a mutable column.** Stock is derived from an append-only ledger.
>
> Sections marked ⚠️ are the ones that most commonly get implemented wrong. Read them twice.

---

## 1. Scope

A single-location inventory system for an electronics retail shop. One shop, no branches, no stock transfers.

**In scope (v1):**
- Product catalog with per-unit **serial/IMEI tracking**
- Stock in (goods receipt) and stock out (sale, damage, loss, return)
- Append-only stock movement ledger with a full audit trail
- Dashboard with KPIs, low-stock and dead-stock alerts
- Topbar quick search — by name, SKU, barcode, **and serial/IMEI**
- Financial reports: inventory valuation, revenue, COGS, gross margin, stock aging, shrinkage
- Three user roles with server-enforced permissions

**Explicitly NOT in scope (v1):**
- ❌ Point of sale / cash drawer / receipt printing
- ❌ Purchase orders and supplier ledgers (a lightweight `Supplier` table exists, but no PO workflow)
- ❌ Barcode *scanning* hardware integration (the `barcode` field exists; see §18)
- ❌ VAT / tax-compliant invoices (the `taxRate` field exists but is unused)
- ❌ Customer records, warranty claims / RMA workflow
- ❌ Multi-branch anything

### 1.1 ⚠️ The one thing that needs explaining: "no POS" + "financial reports"

If the app never records a sale, it has no revenue data and the financial reports have nothing to compute from. The resolution is **not** to build a POS. It is:

> **A sale is a `StockMovement` with `type: OUT`, `reason: SALE`, and a `unitPrice`.**

That's a two-field form at the end of the day, not a checkout terminal. It yields revenue, COGS, and exact per-unit margin with zero POS machinery. There is no `Sale` table, no `SaleItem` table, no `Customer` table. If a customer buys three items at once, that's three movement rows sharing a `reference` (memo number).

### 1.2 Phase 8 scope expansion: cart and invoices

The v1 movement-only sale flow remains valid, but Phase 8 adds `Customer`, `Sale`,
and `SaleItem` as **commercial document models** so one customer can buy multiple
items and receive one immutable invoice. This does not replace the ledger:

- `Sale` / `SaleItem` answer **what was invoiced to whom**.
- `StockMovement` remains the authoritative answer to **what physically moved and
  what revenue/cost was recognized**.
- Checkout creates the sale, its items, serialized-unit transitions, quantity
  updates, and all linked movements in one transaction.
- No cash drawer, card-terminal integration, shift management, loyalty programme,
  online ordering, or full accounts receivable is included.

---

## 2. Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript, `"strict": true` | Money math needs type safety |
| Framework | **Next.js 16** (App Router) | Turbopack default. Node 20.9+ required, 22 LTS recommended. ⚠️ `middleware.ts` is renamed to **`proxy.ts`** — see §9.3 |
| ORM | **Prisma** | Type-safe, mature migrations, best-in-class Next.js docs |
| Database | **PostgreSQL on Neon** (free tier, 512 MB, no expiry, scales to zero) | Relational integrity + real transactions. Stock counts must never silently drift |
| Auth | **Better Auth** | Owns `User`/`Session`/`Account`; extended with a `role` field |
| Money | **Integer minor units (paisa)** | See §17 for why, and the `Decimal` alternative |
| IDs | UUIDv7 (`@default(uuid(7))`, Prisma ≥ 5.16) | Time-sortable, and generated app-side so the JSON→Postgres import needs no ID remapping |
| Unit tracking | **Per-product flag**: `SERIAL` (default) or `QUANTITY` | Serials for phones/laptops/TVs; bulk counts for cables and plugs. Same code paths, one branch |
| Costing | **Exact, per-unit** for SERIAL; weighted-average only for QUANTITY | Each unit carries its own cost, so profit is a subtraction — no FIFO machinery |
| Timezone | Store UTC, render `Asia/Dhaka` | |

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| UI | React 19 + Tailwind + shadcn/ui (copy-in, freely editable) |
| Charts | Recharts |
| Validation | **Zod** — one schema per entity, shared by client form and server action |
| Forms | React Hook Form + `@hookform/resolvers/zod` |
| Password hashing | argon2id (preferred) or bcrypt — handled by Better Auth |
| CSV/PDF export | `papaparse` for CSV, `@react-pdf/renderer` for PDF reports |
| Dates | `date-fns` + `date-fns-tz` |

### 3.1 Architecture

```mermaid
flowchart LR
    A[Browser - React] -->|Server Actions| B[Next.js Server]
    A -->|fetch| C[Route Handlers - /api/search]
    B --> S[Service Layer]
    C --> S
    S --> R[Repository Layer]
    R --> J[(JSON files - Phase 0)]
    R --> P[Prisma Client]
    P --> D[(PostgreSQL / Neon)]
    B --> F[Better Auth]
```

**⚠️ The layering rule that makes the whole plan work:**

- **UI / Server Actions** never touch Prisma directly.
- **Services** hold business logic and transactions (`recordStockOut`, `receiveStock`).
- **Repositories** are the only thing that knows whether data lives in JSON or Postgres.

This is what makes Phase 0 → Phase 1 a one-line change per repository instead of a rewrite. See §13–14.

**Server Actions vs Route Handlers:** Server Actions for form-driven mutations. Route Handlers for on-demand JSON — the quick-search endpoint especially.

---

## 4. Getting Started

```bash
npx create-next-app@latest inventory-system \
  --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd inventory-system

npm install prisma --save-dev
npm install @prisma/client
npx prisma init --datasource-provider postgresql

npm install better-auth
npm install zod react-hook-form @hookform/resolvers
npx shadcn@latest init
npm install recharts lucide-react date-fns date-fns-tz cmdk
npm install papaparse @react-pdf/renderer
```

`.env.local`:

```bash
# Neon POOLED connection (host contains "-pooler") — used at runtime
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"

# Neon DIRECT connection (no "-pooler") — used by `prisma migrate`.
# ⚠️ Migrations cannot run through PgBouncer. Omitting this WILL break migrations.
DATABASE_URL_UNPOOLED="postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"

BETTER_AUTH_SECRET="generate with: openssl rand -base64 32"
BETTER_AUTH_URL="http://localhost:3000"

# Inventory: JSON through Phase 5, PostgreSQL from Phase 6.
# Better Auth and audit logs use PostgreSQL from Phase 3.
DATA_SOURCE="json"
```

> **Building the JSON prototype first?** Skip Prisma/Neon setup for now and go straight to §13.

---

## 5. ⚠️ Domain Model & Core Invariants

**Read this section before writing any code.** Everything else follows from it.

### 5.1 The ledger is the source of truth

`StockMovement` is an **append-only** table. Never `UPDATE`. Never `DELETE`. A mistake is corrected by writing a **new, opposing entry** with `reason: CORRECTION`.

`StockMovement.quantity` is **signed**: positive = into stock, negative = out of stock. Therefore:

```
on-hand(product) = SUM(stock_movements.quantity WHERE product_id = ...)
```

For SERIAL products, quantity is always exactly `+1` or `-1`.

If you ever find yourself writing `currentStock = currentStock - 1` without an accompanying ledger row, **stop** — you have just made the inventory unauditable.

### 5.2 The one deliberate denormalization

`Product.quantityOnHand` is a **cache**, authoritative *only* for `trackingType = QUANTITY` (so a page listing 500 cables doesn't sum the ledger 500 times).

- It **must** be written inside the *same transaction* as the movement insert.
- For SERIAL products it stays `0` and is ignored — on-hand is `COUNT(units WHERE status = 'IN_STOCK')`.
- A reconciliation job (§8.4) compares it against `SUM(quantity)` and reports drift.

### 5.3 Two units of stock

| `trackingType` | Physical row | On-hand | Costing |
|---|---|---|---|
| `SERIAL` | One `ProductUnit` per item, unique serial/IMEI | `COUNT(units WHERE IN_STOCK)` | Exact — each unit's own `costPrice` |
| `QUANTITY` | No unit rows | `Product.quantityOnHand` | Weighted average |

Default new products to `SERIAL`. Use `QUANTITY` for cables, adapters, screws — things where inventing 400 serials would be absurd.

---

## 6. Prisma Schema

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  // Prisma 6: driverAdapters is GA. On Prisma 5, add:
  //   previewFeatures = ["driverAdapters"]
  // Then use @prisma/adapter-neon for HTTP queries on serverless.
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // pooled
  directUrl = env("DATABASE_URL_UNPOOLED") // unpooled — required by `prisma migrate`
}

// ===========================================================================
//  ENUMS
// ===========================================================================

enum Role {
  ADMIN   // everything: cost prices, margins, financial reports, user management
  MANAGER // all stock ops + reports; no user management, no destructive actions
  STAFF   // record stock in/out, view stock. ⚠️ COST PRICES HIDDEN — see §9.2
}

enum TrackingType {
  SERIAL   // one ProductUnit row per physical item
  QUANTITY // counted in bulk, no serials
}

enum UnitStatus {
  IN_STOCK
  RESERVED
  SOLD
  RETURNED // customer brought it back; awaiting inspection or restocked
  DAMAGED
  LOST
  VOID     // created in error and reversed out. Not stock, not a sale.
}

enum MovementType {
  IN
  OUT
  ADJUST
}

enum MovementReason {
  INITIAL_STOCK      // opening balance when first loading the system   (IN)
  PURCHASE           // goods received from a supplier                  (IN)
  CUSTOMER_RETURN    // customer returned an item                       (IN)
  SALE               // sold to a customer                              (OUT)
  RETURN_TO_SUPPLIER // sent back / RMA                                 (OUT)
  DAMAGE             // broken, unsellable                              (OUT)
  LOSS               // theft, shrinkage, unexplained                   (OUT)
  INTERNAL_USE       // shop's own use, demo unit, gift                 (OUT)
  CORRECTION         // reverses an earlier bad entry               (ADJUST)
  STOCK_COUNT        // physical count reconciliation               (ADJUST)
}

// ===========================================================================
//  AUTH  (Better Auth owns the shape of User/Session/Account/Verification)
//  Run Better Auth's schema generator, then add `role` + business relations.
// ===========================================================================

model User {
  id            String    @id            // Better Auth generates this — no @default
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  role          Role      @default(STAFF)
  isActive      Boolean   @default(true)
  banned        Boolean   @default(false) // Better Auth admin plugin; mirrors !isActive
  banReason     String?
  banExpires    DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions  Session[]
  accounts  Account[]
  movements StockMovement[] @relation("MovementActor")
  auditLogs AuditLog[]

  @@index([role])
  @@map("users")
}

model Session {
  id        String   @id
  userId    String
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  impersonatedBy String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

model Account {
  id                    String    @id
  userId                String
  accountId             String
  providerId            String
  password              String?   // hashed by Better Auth for email/password auth
  accessToken           String?
  refreshToken          String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  idToken               String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("accounts")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verifications")
}

/// Who did what, when. Written on every mutating action.
model AuditLog {
  id        String   @id @default(uuid(7))
  actorId   String?
  actor     User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)
  action    String   // "product.create", "stock.out", "user.role_change"
  entity    String   // "Product", "ProductUnit", "User"
  entityId  String?
  before    Json?
  after     Json?
  ip        String?
  createdAt DateTime @default(now())

  @@index([entity, entityId])
  @@index([actorId, createdAt])
  @@index([createdAt])
  @@map("audit_logs")
}

// ===========================================================================
//  CATALOG
// ===========================================================================

model Category {
  id        String     @id @default(uuid(7))
  name      String     @unique
  slug      String     @unique
  parentId  String?
  parent    Category?  @relation("SubCategories", fields: [parentId], references: [id], onDelete: SetNull)
  children  Category[] @relation("SubCategories")
  isActive  Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  products Product[]

  @@map("categories")
}

model Brand {
  id        String   @id @default(uuid(7))
  name      String   @unique
  slug      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  products Product[]

  @@map("brands")
}

model Supplier {
  id        String   @id @default(uuid(7))
  name      String
  phone     String?
  email     String?
  address   String?
  note      String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  units     ProductUnit[]
  movements StockMovement[]

  @@index([name])
  @@map("suppliers")
}

model Product {
  id           String       @id @default(uuid(7))
  sku          String       @unique
  barcode      String?      @unique // field exists now; scanning is v2 (§18)
  name         String
  description  String?
  model        String?      // e.g. "A2882", "UN55TU8000"
  trackingType TrackingType @default(SERIAL)

  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  brandId    String?
  brand      Brand?   @relation(fields: [brandId], references: [id], onDelete: SetNull)

  /// Defaults that pre-fill the stock-in form. The REAL cost/price lives on the
  /// ProductUnit (SERIAL) or on the StockMovement (QUANTITY) — never here.
  defaultCostPrice Int @default(0) // paisa
  defaultSalePrice Int @default(0) // paisa

  taxRate      Int @default(0) // basis points (1500 = 15.00%). Unused in v1 — see §18.
  reorderPoint Int @default(5)

  /// ⚠️ DENORMALIZED CACHE. Authoritative ONLY for trackingType = QUANTITY.
  /// Must be written in the SAME transaction as the StockMovement insert.
  /// For SERIAL products this stays 0. See §5.2.
  quantityOnHand Int @default(0)

  /// Weighted-average cost. Maintained ONLY for trackingType = QUANTITY (§8.2).
  avgCostPrice Int @default(0) // paisa

  imageUrl String? // URL only. ⚠️ Never store image bytes in Postgres (512 MB tier).

  isActive  Boolean  @default(true) // soft delete — history references this row forever
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  units     ProductUnit[]
  movements StockMovement[]

  @@index([categoryId])
  @@index([brandId])
  @@index([isActive])
  @@index([name]) // btree; trigram index for fuzzy search lives in §7
  @@map("products")
}

// ===========================================================================
//  UNITS — one row per physical item. The heart of serial tracking.
// ===========================================================================

model ProductUnit {
  id String @id @default(uuid(7))

  /// IMEI / serial number. Globally unique — an IMEI never belongs to two items.
  serialNo String @unique

  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  status UnitStatus @default(IN_STOCK)

  /// EXACT costing. Every unit carries its own cost, so profit is a subtraction.
  costPrice Int  // paisa — what YOU paid
  salePrice Int? // paisa — what it actually sold for (null until sold)

  supplierId String?
  supplier   Supplier? @relation(fields: [supplierId], references: [id], onDelete: SetNull)

  receivedAt DateTime  @default(now())
  soldAt     DateTime?

  warrantyMonths    Int?
  warrantyExpiresAt DateTime? // computed at sale: soldAt + warrantyMonths

  location String? // "Shelf B3", "Back room"
  note     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  movements StockMovement[]

  @@index([productId, status]) // on-hand counts
  @@index([status])
  @@index([supplierId])
  @@index([receivedAt])        // stock-aging report
  @@index([soldAt])            // sales reports
  @@index([warrantyExpiresAt]) // expiring-warranty widget
  @@map("product_units")
}

// ===========================================================================
//  THE LEDGER — append-only. Your source of truth.
// ===========================================================================

model StockMovement {
  id String @id @default(uuid(7))

  type   MovementType
  reason MovementReason

  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  /// Set for SERIAL products, null for QUANTITY products.
  unitId String?
  unit   ProductUnit? @relation(fields: [unitId], references: [id], onDelete: Restrict)

  /// ⚠️ SIGNED. Positive = into stock, negative = out.
  /// Always exactly +1 / -1 for SERIAL products. Never zero (CHECK constraint, §7).
  quantity Int

  /// Snapshot the economics ON the movement, so every financial report is
  /// computable from this table alone, without joining to mutable rows.
  unitCost  Int  // paisa — cost at the moment of the movement
  unitPrice Int? // paisa — selling price (only when reason = SALE)

  supplierId String?
  supplier   Supplier? @relation(fields: [supplierId], references: [id], onDelete: SetNull)

  /// Lightweight buyer info without a Customer table (that's v2).
  customerName  String?
  customerPhone String?

  reference String? // memo / challan / invoice no. Groups multi-item sales.
  note      String?

  actorId String?
  actor   User?   @relation("MovementActor", fields: [actorId], references: [id], onDelete: SetNull)

  /// Guards against double-submits and retried Server Actions.
  idempotencyKey String? @unique

  /// If this entry reverses an earlier one (reason = CORRECTION).
  reversesId String?

  /// ⚠️ No updatedAt. This table is append-only by design.
  createdAt DateTime @default(now())

  @@index([productId, createdAt])
  @@index([createdAt])
  @@index([type, reason, createdAt])
  @@index([unitId])
  @@index([actorId])
  @@index([supplierId])
  @@map("stock_movements")
}
```

---

## 7. What Prisma Can't Express (hand-written migration)

Run `npx prisma migrate dev --create-only --name constraints_and_search`, then paste this into the generated SQL file:

```sql
-- === CHECK constraints: Prisma has no @@check ===

-- A zero-quantity movement is meaningless.
ALTER TABLE stock_movements ADD CONSTRAINT qty_nonzero CHECK (quantity <> 0);

-- Serial-tracked movements are always exactly one unit.
ALTER TABLE stock_movements ADD CONSTRAINT serial_qty_is_one
  CHECK (unit_id IS NULL OR quantity IN (1, -1));

-- Money is never negative.
ALTER TABLE stock_movements ADD CONSTRAINT cost_nonneg  CHECK (unit_cost >= 0);
ALTER TABLE stock_movements ADD CONSTRAINT price_nonneg CHECK (unit_price IS NULL OR unit_price >= 0);
ALTER TABLE product_units   ADD CONSTRAINT unit_cost_nonneg CHECK (cost_price >= 0);

-- Quantity-tracked stock can never go negative.
ALTER TABLE products ADD CONSTRAINT qty_on_hand_nonneg CHECK (quantity_on_hand >= 0);

-- === Fuzzy search indexes for the topbar (§11) ===
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX products_name_trgm ON products USING GIN (name gin_trgm_ops);
CREATE INDEX products_sku_trgm  ON products USING GIN (sku  gin_trgm_ops);
```

---

## 8. ⚠️ Business Logic (Service Layer)

**Every stock-affecting operation is a single transaction.** The unit status, the ledger row, and the cached quantity move together or not at all.

### 8.1 Stock Out (the important one)

```typescript
// src/services/stock.ts
export async function recordStockOut(input: {
  productId: string;
  serialNo?: string;      // required for SERIAL products
  quantity?: number;      // required for QUANTITY products (positive number)
  reason: 'SALE' | 'DAMAGE' | 'LOSS' | 'INTERNAL_USE' | 'RETURN_TO_SUPPLIER';
  salePrice?: number;     // paisa — required when reason = SALE
  customerName?: string;
  reference?: string;
  actorId: string;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });

    if (product.trackingType === 'SERIAL') {
      // ⚠️ The `status: 'IN_STOCK'` in the WHERE clause is optimistic concurrency.
      // If two staff try to sell the same serial at once, the second throws
      // instead of corrupting the books. Do not remove it.
      const unit = await tx.productUnit.update({
        where: { serialNo: input.serialNo!, status: 'IN_STOCK' },
        data: {
          status: input.reason === 'SALE' ? 'SOLD'
                : input.reason === 'DAMAGE' ? 'DAMAGED'
                : input.reason === 'LOSS' ? 'LOST' : 'RETURNED',
          salePrice: input.salePrice,
          soldAt: input.reason === 'SALE' ? new Date() : undefined,
          warrantyExpiresAt: /* soldAt + warrantyMonths, if SALE */ undefined,
        },
      });

      return tx.stockMovement.create({
        data: {
          type: 'OUT', reason: input.reason,
          productId: product.id, unitId: unit.id,
          quantity: -1,                    // SIGNED
          unitCost: unit.costPrice,        // exact cost — no weighted average needed
          unitPrice: input.salePrice,
          customerName: input.customerName,
          reference: input.reference,
          actorId: input.actorId,
          idempotencyKey: input.idempotencyKey,
        },
      });
    }

    // QUANTITY path
    const qty = input.quantity!;
    const updated = await tx.product.update({
      where: { id: product.id },
      data: { quantityOnHand: { decrement: qty } }, // CHECK constraint blocks going negative
    });

    return tx.stockMovement.create({
      data: {
        type: 'OUT', reason: input.reason,
        productId: product.id,
        quantity: -qty,                   // SIGNED
        unitCost: product.avgCostPrice,
        unitPrice: input.salePrice,
        reference: input.reference,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  });
}
```

### 8.2 Stock In (goods receipt)

- **SERIAL:** the form takes a product, a supplier, a unit cost, and **a list of serial numbers**. Create N `ProductUnit` rows + N movements of `+1`. Reject duplicate serials up front (the unique index will catch them anyway, but a clean error is better UX).
- **QUANTITY:** one movement of `+n`, increment `quantityOnHand`, and recompute weighted-average cost:

```
newAvgCost = ((oldQty * oldAvgCost) + (newQty * newUnitCost)) / (oldQty + newQty)
```

### 8.3 Corrections
Never edit or delete a movement. Write a new one with `reason: CORRECTION`, the opposite sign, and `reversesId` pointing at the original.

### 8.4 Reconciliation job
An admin-only page that, per product, compares the cache against the ledger and reports drift:

```
SERIAL:   COUNT(units WHERE status='IN_STOCK')  vs  SUM(movements.quantity)
QUANTITY: products.quantityOnHand               vs  SUM(movements.quantity)
```
If these ever disagree, a transaction boundary was missed somewhere. The ledger wins.

---

## 9. Auth & Authorization

### 9.1 Roles

| Capability | ADMIN | MANAGER | STAFF |
|---|:--:|:--:|:--:|
| View stock levels, product details | ✅ | ✅ | ✅ |
| Record stock in / stock out | ✅ | ✅ | ✅ |
| **See cost prices & profit margins** | ✅ | ✅ | ❌ |
| Create / edit products, categories, suppliers | ✅ | ✅ | ❌ |
| Financial reports | ✅ | ✅ | ❌ |
| Corrections & reconciliation | ✅ | ✅ | ❌ |
| User management, role changes | ✅ | ❌ | ❌ |
| Soft-delete products | ✅ | ❌ | ❌ |

### 9.2 ⚠️ Hiding cost prices from STAFF

Do **not** do this by hiding a `<div>`. Strip the fields **server-side** before the data ever leaves the server:

```typescript
// src/lib/dto.ts
export function toProductDTO(p: Product, role: Role) {
  const base = { id: p.id, sku: p.sku, name: p.name, /* ... */ };
  if (role === 'STAFF') return base;              // costs never serialized
  return { ...base, costPrice: p.defaultCostPrice, avgCostPrice: p.avgCostPrice };
}
```

A hidden button is not a permission. Every Server Action re-checks the session role before mutating — no exceptions.

### 9.3 ⚠️ `proxy.ts`, not `middleware.ts`

Next.js 16 renamed `middleware.ts` → `proxy.ts` (the exported function is renamed too; there's a codemod: `npx @next/codemod@latest rename-middleware-to-proxy .`). It runs on the Node.js runtime.

**Use it only for the coarse check** — "is there a session? no? → `/login`". Next.js 16 explicitly steers heavy logic (database checks, role resolution) *out* of this layer and into the Data Access Layer / Route Handlers. Role enforcement belongs in the service layer, not the proxy.

---

## 10. Dashboard

**KPI cards:**
- Total stock value **at cost** and **at retail** (and the implied potential margin)
- Units in stock / distinct SKUs
- Low stock (on-hand ≤ `reorderPoint`) and out-of-stock counts
- This month: revenue, COGS, gross profit

**Panels:**
- **Low-stock alerts** — actionable list with a "reorder" note
- **Dead stock** ⚠️ — products with **no OUT movement in 60/90 days**. This is the single most valuable widget for an electronics shop: it's capital sitting on a shelf while the model depreciates.
- **Recent activity** — live feed of the last 20 movements, with actor
- **Expiring warranties** — units whose `warrantyExpiresAt` is within 30 days
- **Top movers / slow movers** (last 30 days)

**Charts (Recharts):** stock value over time, daily in vs. out, revenue & margin trend.

---

## 11. Quick Search (topbar)

- `⌘K` / `Ctrl+K` palette, `cmdk` + shadcn. Debounce 250 ms. Route Handler at `/api/search`.
- **⚠️ Search order matters.** Query **serial/IMEI with an exact equality match FIRST** — it hits the unique index and returns in microseconds. Only if that misses, fall back to trigram matching on name / SKU / barcode.

  This is the real-world flow: a customer walks in with a broken phone, you type the IMEI, and you instantly get *that unit* — when it was received, from which supplier, what it cost, when it sold, and whether it's still under warranty.
- Results are grouped: **Units** (exact serial hits) above **Products** (fuzzy hits).
- Respect the DTO rule from §9.2 — a STAFF search result must not contain cost prices in the JSON payload.

---

## 12. Financial Reports

Every one of these is computable **from `stock_movements` alone**, because the economics are snapshotted onto each row.

| Report | Definition |
|---|---|
| **Inventory valuation** | SERIAL: `SUM(costPrice)` of `IN_STOCK` units. QUANTITY: `qty × avgCost`. Grouped by category / brand. This is your balance-sheet number. |
| **Revenue / COGS / gross margin** | Over `reason = SALE`: revenue `= SUM(-quantity × unitPrice)`, COGS `= SUM(-quantity × unitCost)`, profit = the difference. By day / month / category / brand. |
| **Profit per product** | Exact, thanks to per-unit costing. Sortable — shows what's actually worth stocking. |
| **Purchase spend** | Over `reason = PURCHASE`, by supplier and period. |
| **Stock aging** ⚠️ | `now − receivedAt`, bucketed 0–30 / 31–60 / 61–90 / 90+ days, valued at cost. Tells you how much capital is stuck in old stock. |
| **Shrinkage** | `DAMAGE` + `LOSS` movements, valued at cost. Watch this number. |
| **Movement audit** | Full filterable ledger: date, product, type, reason, actor. |

All reports export to CSV (`papaparse`) and PDF (`@react-pdf/renderer`).

---

## 13. Phase 0 — JSON Prototype

### 13.1 ⚠️ Two things to know before you start

1. **JSON writes do not work on Vercel.** Serverless filesystems are read-only. Phase 0 is a **local-development prototype only**. Do not attempt to deploy it.
2. **JSON files have no transactions.** Read-modify-write is not atomic; two concurrent requests can clobber each other. Fine for solo local dev, but it's exactly why §8 wraps everything in `prisma.$transaction` later.

### 13.2 The repository interface (written once, used by both backends)

```typescript
// src/repositories/types.ts
export interface ProductRepository {
  findAll(filters?: { categoryId?: string; activeOnly?: boolean }): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  search(query: string): Promise<Product[]>;
  create(data: CreateProductInput): Promise<Product>;
  update(id: string, data: Partial<CreateProductInput>): Promise<Product>;
  softDelete(id: string): Promise<void>;
  // ⚠️ NOTE: there is deliberately NO `adjustStock(id, delta)` method.
  // Stock can ONLY move via StockMovementRepository.record(). If a caller can
  // change stock without writing a ledger row, the ledger is a lie.
}

export interface ProductUnitRepository {
  findBySerial(serialNo: string): Promise<ProductUnit | null>;
  findByProduct(productId: string, status?: UnitStatus): Promise<ProductUnit[]>;
  countInStock(productId: string): Promise<number>;
  createMany(units: CreateUnitInput[]): Promise<ProductUnit[]>;
  updateStatus(id: string, status: UnitStatus, data?: Partial<ProductUnit>): Promise<ProductUnit>;
}

export interface StockMovementRepository {
  record(input: CreateMovementInput): Promise<StockMovement>; // append-only
  findByProduct(productId: string): Promise<StockMovement[]>;
  findByDateRange(from: Date, to: Date, filters?: MovementFilters): Promise<StockMovement[]>;
  sumQuantity(productId: string): Promise<number>; // the on-hand invariant
}
```

Define one per entity, mirroring §6. Every method is `async` **even in the JSON implementation** — that way not a single call site changes in Phase 1.

### 13.3 JSON implementation notes

```
data/
├── products.json
├── product-units.json
├── stock-movements.json
├── categories.json
├── brands.json
├── suppliers.json
└── users.json
```

⚠️ **Write atomically** — write to a temp file, then `rename()`. Otherwise a crashed process leaves you with a truncated, unparseable `products.json`:

```typescript
async function writeAll<T>(file: string, rows: T[]): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2));
  await fs.rename(tmp, file); // atomic on POSIX
}
```

Serialize writes through a simple in-process queue/mutex, and generate IDs with UUIDv7 app-side so they carry over to Postgres unchanged.

### 13.4 The switch

```typescript
// src/repositories/index.ts — the only file that changes when you migrate
const source = process.env.DATA_SOURCE ?? 'postgres';
export const db = source === 'postgres'
  ? (await import('./prisma')).prismaRepositories
  : jsonRepositories;
```

Nothing above this file — services, Server Actions, UI — ever imports `json/` or `prisma/` directly.

---

## 14. Phase 6 — Migration to Neon

1. Create the Neon project; copy **both** the pooled and direct connection strings into `.env.local`.
2. Apply Prisma migrations, the §7 SQL constraints, correction uniqueness, and
   trigram search indexes.
3. Implement transaction-scoped Prisma repositories behind the existing §13.2
   contracts. Stock services must receive the scoped repositories inside
   `prisma.$transaction`; closing over the global client would silently move writes
   outside the transaction.
4. **Clean-start decision:** do not import prototype JSON catalog, unit, movement,
   or dummy seed data. New inventory is created through authenticated CRUD and
   stock operations. Keep the JSON adapter only as a legacy local/test backend.
5. Set `DATA_SOURCE=postgres` and run the rollback-only PostgreSQL repository
   verifier. It may create temporary rows inside a transaction but must deliberately
   roll back and prove that none remain.
6. Run §8.4 reconciliation. `SUM(movements.quantity)` must equal on-hand for every
   product. Any mismatch blocks the cutover.

### 14.1 Neon specifics
- ⚠️ `PrismaClient` **must be a global singleton** in dev, or Next.js hot-reload will open a new connection on every save and exhaust the pool.
- Neon's free tier **auto-suspends** after inactivity — expect a cold-start delay on the first query. Normal; don't debug it.
- 512 MB is ample for structured rows. Protect it: images go to blob storage (URL only), and archive `audit_logs` to CSV yearly.
- **Back up.** Neon's free tier has a limited restore window. Add a weekly CSV export of all tables — it costs nothing and it's the difference between an inconvenience and a catastrophe.

---

## 15. Testing

Prioritize by blast radius. The money and stock paths are the ones that matter:

- **`recordStockOut` concurrency** — two simultaneous sales of the same serial. The second **must** throw. This is the single most important test in the codebase.
- **Ledger invariant** — after any sequence of operations, `SUM(quantity) == on-hand`, always.
- **Idempotency** — replaying the same `idempotencyKey` creates exactly one movement.
- **RBAC** — a STAFF session hitting an admin Server Action gets rejected, and STAFF API payloads contain no cost fields.
- **Weighted-average cost** math for QUANTITY products.

Vitest for units/services, Playwright for the critical flows.

---

## 16. Milestones

| Phase | Deliverable |
|---|---|
| **0** | Zod schemas + repository interfaces + JSON adapters + seed data. No UI. |
| **1** | Catalog CRUD (products, categories, brands, suppliers) |
| **2** | Stock in (with serial entry) + stock out. **The §8 service layer.** |
| **3** | Better Auth + roles + `proxy.ts` + audit log |
| **4** | Dashboard + quick search |
| **5** | Financial reports + CSV/PDF export |
| **6** | **Swap to Neon** (§14). Should be a boring afternoon if §13.2 was respected. |
| **7** | Barcode scanning + Warranty/RMA (§18) |
| **8** | Customer records + cart checkout + printable invoices (§19) |
| **9** | Production readiness, localization, account management, and operational tooling (§20) |

---

## 17. Decision Log

**PostgreSQL/Neon over DynamoDB.** DynamoDB's Always Free tier (25 GB, no expiry) was genuinely tempting. It lost on two counts: every report in §12 needs filtering and aggregation across relations (trivial in SQL; requires upfront GSI design plus app-side aggregation or maintained summary records in DynamoDB), and the quick search in §11 needs partial-match text search, which DynamoDB has no native answer for (it would need OpenSearch alongside it, via Streams). Neon matches DynamoDB's defining property — a free tier that never expires — while keeping joins, aggregation, and `pg_trgm`. At this app's data volume (structured rows, no media), 512 MB is not a near-term constraint.

**Integer paisa over `Decimal(10,2)`.** Both are correct — Postgres `Decimal` is exact, not floating-point, so there's no bug either way. Integers win on one practical point: Prisma returns `Decimal` as a `Prisma.Decimal` object (decimal.js), which is **not serializable across the Server → Client Component boundary**. Every value must be `.toNumber()`-ed before it reaches a client component, and forgetting once is a runtime error. Integers sidestep that entirely. Format at the display layer: `(85000 / 100).toLocaleString('en-BD')` → `৳850.00`.

**Serial-per-unit as a Phase 1 concept.** It changes what a *unit of stock is*, so it cannot be bolted on later without backfilling serials for all existing stock and rewriting every stock operation. It also pays for itself: per-unit costing makes profit exact and deletes the entire FIFO/weighted-average problem for serialized goods.

---

## 18. Phase 7 — Barcode scanning + Warranty/RMA

**Implementation status: complete (20 July 2026).**

Phase 7 contains only these two features. It does **not** add a Sales Register;
the existing Movement Ledger and filterable Movement Audit remain the detailed
sales-history tools.

### 18.1 Barcode scanning

A USB/Bluetooth barcode scanner is a keyboard: it types a value and presses
Enter. Do not add a hardware SDK or duplicate barcode storage.

**Data reuse:**

- Product barcode: existing `Product.barcode`.
- Serial/IMEI: existing `ProductUnit.serialNo`.
- Product text lookup: existing search service and PostgreSQL indexes.

**Resolution order:**

1. Exact serial/IMEI.
2. Exact product barcode.
3. Exact SKU.
4. Existing product search as a manual fallback.

**Implementation requirements:**

- Add an exact barcode repository lookup; exact indexed lookups happen before
  fuzzy search.
- Build one reusable focused scanner input for search, stock in/out, RMA intake,
  and the future Phase 8 cart.
- Submit on scanner Enter, suppress accidental duplicate scan submissions, and
  keep mouse/manual selection fully usable.
- Clearly distinguish unknown, inactive, unavailable, and already-processed
  serials.
- Camera-based mobile scanning is deferred.
- STAFF responses must continue to omit all cost fields.

### 18.2 Warranty/RMA data model

Initial RMA scope is serialized products because warranty eligibility and exact
sale history are already unit-based.

`WarrantyClaim` stores:

- Automatic claim number (default format `RMA-YYYY-######`).
- `unitId` and original SALE movement.
- Claimant name/phone snapshots (a nullable `customerId` is added in Phase 8).
- Reported issue and received physical condition.
- Current customer-facing status, coverage classification, resolution, assignee,
  and opened/completed timestamps.
- Current custody location; custody is not inventory availability.

`WarrantyClaimEvent` is append-only and stores every status/custody/note change,
actor, previous/new values, and timestamp. The claim may cache current status for
listing, but its event history is never edited or deleted.

`SupplierWarrantyCase` is optional and linked to a customer claim. It separately
tracks supplier, supplier reference, supplier coverage, sent/returned dates,
status, and resolution. Supplier rejection does not automatically reject the
customer-facing claim.

**Suggested customer-claim statuses:**

`SUBMITTED`, `UNDER_INSPECTION`, `APPROVED`, `REJECTED`, `SENT_FOR_REPAIR`,
`READY_FOR_COLLECTION`, `REPLACED`, `COMPLETED`, `CANCELLED`.

**Coverage classifications:**

`IN_WARRANTY`, `OUT_OF_WARRANTY`, `GOODWILL`, `UNKNOWN_PROOF_OF_PURCHASE`.
Out-of-warranty repairs are recorded for service history, but repair billing is
outside Phase 7 and may later become a Phase 8 invoice/service line.

### 18.3 ⚠️ RMA inventory policy

Opening or receiving a claim creates **no stock movement**. The unit was already
sold and is not available inventory. Inspection custody is tracked on the claim;
the original `ProductUnit` normally remains `SOLD` while being inspected,
repaired, sent to a supplier, or returned to the customer.

- **Repair returned to customer / no fault / rejected:** unit remains `SOLD`; no
  stock movement.
- **Replacement issued:** add `WARRANTY_REPLACEMENT` to `MovementReason`. The
  replacement unit/quantity creates a normal OUT movement with exact/average cost,
  `unitPrice = null`, and a link to the claim. It creates warranty expense, never
  sales revenue. Claim resolution and stock movement are one transaction.
- **Accepted back and approved for resale:** create `CUSTOMER_RETURN` `+1` and
  transition the original unit from `SOLD` to `IN_STOCK` in one transaction.
- **Accepted back but written off:** record `CUSTOMER_RETURN` `+1`, followed by
  `DAMAGE` `-1`, and end at `DAMAGED`. The pair preserves receipt and write-off
  history while net inventory remains zero.
- A unit under inspection must never be marked `IN_STOCK` or offered for sale.

### 18.4 RMA permissions and UI

- STAFF: scan/search units, create claims, add notes, and record handovers.
- MANAGER/ADMIN: approve/reject, authorize goodwill/out-of-warranty replacement,
  issue replacement stock, restock/write off returns, and complete/cancel claims.
- Pages: claim list, scanner-based intake, claim detail/event timeline, assigned
  open claims, completed claims, and optional printable intake acknowledgement.
- Every transition and stock-affecting outcome is validated server-side, audited,
  idempotent, and tested for concurrent processing.

---

## 18.5 Phase 7.5 — Stock label printing

**Implementation status: complete (28 July 2026).**

Stock received into the shop can be identified and scanned from a physical
50 × 25 mm adhesive label. Labels are projections of existing inventory data,
not a new inventory entity:

- SERIAL labels encode the existing `ProductUnit.serialNo`.
- QUANTITY labels encode `Product.barcode`, falling back to `Product.sku`.
- No label table, duplicate barcode, saved image, or stock movement is created.
- Labels contain shop name, product name, brand/model, SKU, the scannable Code
  128 symbol, and its human-readable value. Price, cost, supplier, and category
  are deliberately omitted.

The receive-stock success state links to the exact receipt labels. A reusable
**Stock → Print labels** page also supports product selection, scanner lookup,
individual serialized-unit selection, manually entered copies, preview, and
reprinting. Output supports both one-label-per-page thermal printing and a
four-column A4 adhesive-sheet layout.

`PRINT_LABELS` allows STAFF, MANAGER, and ADMIN to print. STAFF can print or
reprint only currently in-stock units/products; `REPRINT_NON_STOCK_LABELS`
allows MANAGER and ADMIN to select historical/non-stock units. The server
revalidates product ownership and unit status before each print request and
records `label.print` in the append-only audit log. Printing never changes stock.

---

## 19. Phase 8 — Customers + Cart Checkout + Invoices

**Implementation status: complete (28 July 2026), excluding returns/refunds as
explicitly deferred in §19.5.**

Phase 8 solves one customer buying multiple products without repeating customer
details. It is a deliberately limited inventory-connected checkout, not a full
POS. A separate Sales Register is explicitly out of scope.

### 19.1 Data ownership — do not duplicate authority

| Concern | Authoritative data |
|---|---|
| Reusable contact details | `Customer` |
| Invoice identity and display snapshots | Immutable `Sale` + lean `SaleItem` |
| Stock quantities and movement history | `StockMovement` |
| Sold quantity, realized unit price, and cost | The `StockMovement` linked one-to-one from `SaleItem` |
| Serial identity and current inventory disposition | `ProductUnit` |
| Detailed sales history/reporting | Existing Movement Ledger/Audit |

Snapshots are deliberate only where history must not change: customer name/phone,
product name/SKU, list price, warranty term, and invoice totals. Actual selling
price, quantity, and cost already exist on the immutable linked movement and are
derived from it when rendering an invoice. Do not create a second stock counter
or duplicate movement-owned financial fields in invoice rows.

### 19.2 Customer records

`Customer` deliberately stores only name, normalized/indexed phone, active status,
and timestamps. Checkout can search by name/phone, create a customer inline,
select one customer once for the whole cart, or use a walk-in customer without
inventing a database record. The customer section provides name/phone search and
links each customer to their completed invoice history. Existing movement customer
snapshots remain for backward-compatible history; new invoices link to the
customer and preserve immutable name/phone snapshots.

### 19.3 Cart and checkout

- Checkout is the only user-facing path that records `SALE`. The former Stock out
  page is **Inventory removal** and accepts only damage, loss, internal use, and
  return-to-supplier reasons, preventing sales without invoices.
- Reuse the Phase 7 scanner component to add serials, product barcodes, or SKUs.
- SERIAL lines reference one exact available `ProductUnit`; QUANTITY lines carry a
  positive quantity.
- Support quantity changes, line removal, customer selection once, notes/reference,
  and authorized selling-price adjustment.
- A persisted draft can be explicitly discarded after confirmation. Discarding
  deletes its cart items and customer/payment selections, records an audit event,
  and never changes inventory because draft items do not reserve stock.
- The server revalidates every serial and quantity at checkout. Client state is
  never authoritative.
- Completing a sale requires an explicit confirmation showing the total and
  warning that stock will change and an immutable invoice will be created.
- One idempotent PostgreSQL transaction creates `Sale`, `SaleItem` rows, unit
  transitions, quantity-cache updates, and linked SALE movements. Any unavailable
  item rolls back the entire checkout.

`Sale` stores invoice number, optional customer, immutable customer snapshot,
actor, status, subtotal/discount/total snapshots, idempotency key, notes, and
timestamps. `SaleItem` stores only its linked movement plus invoice-specific
immutable product name, SKU, serial, list price, and warranty snapshots. Product,
unit, sold quantity, actual price, discount, line total, and cost are not repeated;
invoice reads derive them from the linked immutable movement and sale totals.

The actual selling price and list-price-at-sale are snapshotted so two sales of
the same item at different prices remain explainable even after catalog prices
change. Financial reports continue to use movement economics.

### 19.4 Invoice printing

- Automatic concurrency-safe invoice sequence (default `INV-YYYY-######`).
- The invoice register supports server-side lookup by invoice/customer/phone/
  reference/salesperson plus Dhaka-local date range, payment status/method, and
  total-price range, including walk-in versus saved-customer filtering. Results
  are newest first and bounded.
- Print-friendly A4 page and PDF download/reprint.
- Shop details, invoice/date, actor, customer snapshot, line items, serial/IMEI,
  quantity, prices, discounts, subtotal/total, warranty information, and policy
  notes.
- Phase 8 invoices are ordinary sales invoices, not VAT/tax-compliant invoices.
- Completed invoices are immutable. Reprints show the original snapshot.

### 19.5 Corrections and returns

Completed invoices and their movements are never edited or deleted. Full
cancellation, item-level returns, refunds, exchanges, and return documents are
explicitly deferred by the owner from the first Phase 8 implementation. Existing
ledger correction remains available for authorized correction of an erroneous
movement, but it does not pretend to be a customer-refund workflow.

### 19.6 Phase 8 decisions to confirm before implementation

**Decisions confirmed 28 July 2026:**

1. **Updated 20 August 2026:** ordinary checkout drafts are persisted in the
   current browser's local storage for 24 hours and survive refresh/navigation.
   Users can explicitly discard an unwanted draft after confirmation. Products,
   prices, customer/payment details, identification details, and EMI inputs are
   treated as untrusted browser data and are validated again by the server when
   the sale is completed. The final sale, stock movements, invoice, EMI records,
   and any staged trade-in are then committed atomically. A minimal server draft
   remains only for a protected trade-in being prepared across pages; ordinary
   cart lines and checkout form fields are not duplicated in the database.
2. STAFF may change the actual selling price; list and actual prices are both
   snapshotted for audit and historical explanation.
3. Record payment method plus `PAID`/`UNPAID`; payment processing and customer
   credit remain out of scope.
4. Provide A4/PDF and 80 mm thermal invoice layouts.
5. Item-level returns and refund accounting are deferred.

---

## 20. Phase 9 — Production Readiness, Localization + Account Management

**Implementation status: complete (3 August 2026).** Production migrations and
the clean-start reset were completed, the current application was deployed, the
production smoke check passed, and reconciliation reported no discrepancy.

Phase 9 prepares the completed inventory system for client use without changing
the stock-ledger or invoice ownership boundaries established in earlier phases.

### 20.1 Mobile authentication and account settings

- Replace public email login with Bangladeshi mobile-number login while retaining
  opaque internal Better Auth email identifiers.
- Normalize authentication numbers to `+880...` and require unique numbers.
- Keep password credentials in Better Auth `Account` rows and preserve existing
  passwords during the one-time mobile-auth migration.
- Provide authenticated password change under Settings and ADMIN password reset
  for other users; password changes revoke prior sessions.
- Provide a guarded development-only emergency ADMIN recovery command with a
  read-only inspection stage, explicit confirmation, Better Auth hashing, session
  revocation, and an append-only audit record. No public forgot-password endpoint
  is added while email/SMS recovery is unavailable.

### 20.2 English/Bangla localization

- Users can switch the application UI between English and বাংলা; the preference
  is stored on `User.locale` and follows the authenticated account.
- Navigation, forms, validation/notification messages, tables, dashboard metrics,
  reports, and operational explanations use the shared translation catalog.
- Dates retain familiar month names and use 12-hour Asia/Dhaka time. Invoice
  language remains independent/deferred rather than duplicating invoice data.

### 20.3 Responsive and operational UX

- Provide mobile sidebar navigation, readable desktop scaling, compact mobile
  spacing, responsive reports/invoices, stable dialogs, and non-overflowing search.
- Use route-level loading screens for first visits and localized result-section
  loading states for filtering, tab changes, and stock-label preparation.
- Preserve immediate form selections during server navigation and avoid replacing
  whole pages when only a result panel is loading.
- Improve dashboard visual hierarchy, terminology, tooltips, icons, charts, and
  success workflows such as receipt-to-label printing.

### 20.4 Environment separation and production operations

- Development uses an isolated Neon child branch; Vercel production uses only the
  production branch connection strings. Development actions must never share the
  production runtime URL.
- Apply committed Prisma migrations with `prisma migrate deploy`, then run the
  one-time mobile-auth data migration before client rollout.
- Provide a guarded production business-data reset that preserves only `users`,
  password `accounts`, and `_prisma_migrations`. It requires read-only inspection,
  an exact database fingerprint, explicit destructive confirmation, a transaction,
  `TRUNCATE ... RESTRICT`, preservation checks, and a final audit record.
- Take a Neon snapshot before destructive production operations, prevent concurrent
  shop activity during rollout, revoke sessions after a clean-start reset, and run
  reconciliation plus authenticated smoke checks after deployment.

### 20.5 Catalog maintenance controls

**Implemented 3 August 2026:**

- ADMIN and MANAGER can rename brands and categories. Every change is recorded
  in the append-only audit log.
- "Remove" is a reversible archive, never a hard delete, so historical products,
  movements, invoices, and reports keep their original relationships. Removed
  records can be restored.
- A brand/category cannot be removed while an active product depends on it; a
  category also cannot be removed while it has active child categories.
- New products may use only active brands/categories. An existing product may
  retain an archived selection, but cannot be changed to another archived one.
- Brand and category pages provide immediate in-memory search, active/removed
  status, product-usage, and ordering filters. Ordering supports newest/oldest,
  most/fewest products, and name A–Z/Z–A without querying the database for every
  filter change.
- Long brand/category result sets scroll inside their own cards, while creation
  controls and filters remain visible. Edit and archive/restore confirmation
  dialogs remain outside the scroll layer.

### 20.6 Phase 9 completion gate

Phase 9 is complete only after:

1. Production schema migrations are current.
2. The production ADMIN can sign in by mobile number.
3. Any approved clean-start business-data reset has completed from a verified
   snapshot and preserved users/accounts/preferences.
4. The current application is deployed to the canonical Vercel production domain.
5. Login, role enforcement, catalog CRUD, stock receipt/removal, checkout, invoice
   printing, reports, localization, and mobile navigation pass production smoke
   checks.
6. Reconciliation reports no stock-versus-ledger discrepancy.

**Completion confirmed 3 August 2026:** all six rollout checks passed.

### 20.7 Post-completion extension — accepted used-phone intake

**Implementation status: complete (8 August 2026).**

Used phones are stored as serialized physical units of the existing product
model; “new” and “used” are not catalog categories. Only MANAGER and ADMIN can
inspect and accept a used phone. STAFF may view and sell an accepted unit, but
there is no staff-prepared draft, pending approval queue, rejected-device record,
photo storage, consignment workflow, or “for parts” grade.

- The intake displays a collapsible checklist with Working, Defective, Not tested,
  and Not applicable outcomes. Matching IMEI, cleared account/activation lock,
  seller ownership confirmation, and server-side duplicate-IMEI validation are
  acceptance gates.
- Grades are A, B, C, and Refurbished, with definitions shown at the point of
  selection. Battery health, declared defects, accessories, unit asking price,
  location, and configurable warranty duration in exact days or calendar months
  belong to `ProductUnit`.
- `UsedDeviceAcquisition` is accepted-only permanent history: direct purchase or
  completed checkout trade-in, normalized Bangladeshi seller mobile, optional identification text,
  approved value, accepting user, declaration, reference, and note. It is not a
  temporary inspection table.
- A direct purchase uses one idempotent transaction to create the unit, accepted
  acquisition, and exactly one `+1 PURCHASE` movement. A trade-in starts only
  from Checkout and is stored provisionally inside that actor's cart draft; it
  creates no unit, movement, credit, or acquisition until the linked sale commits.
- Itemized pre-sale `RefurbishmentExpense` rows increase the exact unit cost while
  preserving the original acquisition value. They can be added only while the
  used phone remains in stock.
- Unit asking price is the checkout default. Invoice items snapshot grade,
  declared defects, warranty, and IMEI so later edits cannot rewrite the sale.
- Trade-in value is stored and printed as payment credit, never as a selling-price
  discount. On completion, the incoming unit, `+1 TRADE_IN` movement, acquisition,
  outgoing sale movements, invoice, and acquisition-to-sale link commit in one
  database transaction. Cancelling or discarding checkout deletes only the draft.
  Legacy unattached trade-ins are not offered by Checkout; new trade-ins always
  use the atomic cart-owned workflow. Credit above the sale total is intentionally rejected until cash-payout
  accounting is designed.
- The existing serialized-unit page filters new/used grades and acquisition type,
  shows role-safe condition/acquisition details, and supports authorized
  refurbishment costs and asking-price/warranty updates.

The Phase 10 staff discount floor is deliberately not part of this extension.
Until Phase 10, existing checkout price-editing behavior remains unchanged.

Offline mutation queues and conflict resolution are not part of Phase 9. They
remain deferred and may become Phase 10 if revisited.

---

## 21. Phase 10 — Finance and controlled selling

Phase 10 is split into independently deployable increments. Its priorities are
operating expenses, EMI sales, staff discount limits, and dashboard improvements.

### 21.1 Operating expenses

**Implementation status: complete (11 August 2026).**

- Store every operating-expense record permanently. The register opens on the
  current Asia/Dhaka month, while an unrestricted from/to range supports older
  analysis. Month-end archiving, scheduled jobs, and automatic email are not
  required because records remain queryable in the database.
- Keep operating expenses separate from inventory purchases, COGS, used-device
  acquisitions, trade-ins, refurbishment costs, customer refunds, supplier
  returns/recoveries, and shrinkage. Recording an expense never changes stock or
  writes a stock movement.
- Each record has a stable expense number, expense date, configurable category,
  description, integer-paisa amount, optional payee/reference/note, payment
  method, status, and recorded/updated/voided actor metadata.
- ADMIN and MANAGER can view, create, and edit active expenses and manage
  reversible category archiving. Only ADMIN can void an expense. Voiding retains
  the original record and audit history while excluding it from totals. STAFF
  cannot access the expense register.
- Provide search, date/category/payment/user/status/amount filters, ordering,
  scrollable results, current selection preservation, result-only loading, and
  on-demand CSV/PDF exports. Shared Zod schemas validate controlled forms in the
  browser and again at the server boundary.
- Dashboard financial users see current-month operating expenses and net
  operating profit. Separate cards expose operating expenses, effective
  DAMAGE/LOSS inventory loss, and permanent shop-use/gift cost. Net operating
  profit deducts all three from sales profit; supplier returns are not treated as
  shrinkage. New permanent removals distinguish SHOP_USE from GIFT, while legacy
  INTERNAL_USE records remain supported and included in the same cost total.
  Temporary demo stock is not removed through this workflow because it remains
  shop-owned inventory; a future availability/status workflow may model demos.

### 21.2 Supplier financial analytics

**Implementation status: complete (12 August 2026).**

- Supplier metrics are derived from the append-only stock ledger and supplier
  return settlements; no duplicate supplier-total table is maintained. Composite
  supplier/date indexes support the reporting queries.
- The register defaults to all recorded time. Optional from/to, supplier,
  product, category, brand, supplier-status, activity, purchase-presence, and
  return-presence filters are applied only when the user requests them; Reset
  returns to all-time results.
- Show gross purchase cost, received units, distinct supplied products, average
  acquisition cost, returned units/cost, confirmed recovery, recovery
  surplus/deficit, net retained purchase cost, return rate, and last purchase.
  Corrections cancel their original purchase effect, cancelled returns are
  excluded, and supplier credit is recovered only after replacement/exchanged
  stock is received.
- Supplier detail pages provide product-level purchase/return breakdowns and a
  chronological purchase, return, and settlement history. CSV and PDF exports
  use the same filters and calculations as the screen.
- ADMIN and MANAGER may view/export these cost analytics. STAFF cannot access
  them. This remains analytics rather than a payable ledger: purchase orders,
  invoices, partial payments, and outstanding balances remain deferred.

### 21.3 Shop-managed EMI

**Implementation status: complete (16 August 2026).**

- EMI is an alternate checkout mode on the existing sale/cart transaction—not a
  second sales workflow. Terms are limited to 3, 6, 9, or 12 months. The first
  installment is due on the chosen first-due date, which must be today or within
  the next 31 days; later dates preserve that day where possible and otherwise
  use the final valid day of the month.
- The cashier enters each line's EMI selling price directly in the existing
  checkout cart. The selected 3/6/9/12-month term controls the installment
  schedule rather than maintaining a second product-price configuration screen.
  Browser and transactional server validation require a valid whole-taka EMI
  price for every line. The regular selling price is allowed; a higher EMI price
  may be entered when the shop charges more for installment sales. Existing
  role-specific selling-price controls still apply at final checkout.
- EMI checkout requires a saved customer with an identification type (NID,
  passport, or birth certificate) and identification number. An optional down
  payment and an existing checkout trade-in credit reduce the financed balance.
  Sale, invoice, stock movements, EMI contract, and complete installment
  schedule commit together in the checkout transaction.
- The original invoice remains the only sales invoice and displays the EMI
  summary and schedule. Installment collections create compact numbered payment
  receipts and FIFO payment allocations, not duplicate invoices or stored PDF
  blobs. This keeps payment history queryable without duplicating sale data.
- STAFF can create EMI sales and view contracts but cannot collect payments.
  ADMIN and MANAGER can record payments. Early settlement requires ADMIN or
  MANAGER approval, a reason, and an approved discount; it reduces the remaining
  schedule without rewriting the original sale price.
- Open contracts automatically distinguish active and overdue schedules. The
  EMI register supports contract/invoice/customer/mobile search plus contract
  status, installment status, term, contract-date, outstanding-range, and
  ordering filters. It exposes installment balances and receipts and adds open-contract,
  outstanding-balance, and overdue-contract indicators to the dashboard for
  financial roles.
- An EMI invoice cannot be voided after installment collection begins. Before
  collection, invoice voiding restores stock and marks the contract and schedule
  VOIDED; only the actual down payment is treated as the customer refund.

### 21.4 Dashboard period comparison

**Implementation status: complete (13 August 2026).**

- A single dashboard-wide current-day, current-week, or current-month selector controls all
  period-based financial cards, daily charts, mover rankings, and recent stock
  activity without reloading the page.
- Calendar periods never mix arbitrary days across weeks or months. For this
  shop, the dashboard week begins Friday and ends Thursday in Asia/Dhaka.
  Financial cards compare the selected calendar
  window with its preceding calendar period. When the earlier window is zero, the UI states
  that there was no previous activity instead of displaying an invalid or
  misleading percentage.
- Live inventory snapshots—units on hand, low stock, stock value, potential
  margin, dead stock, and expiring warranties—remain current-state indicators
  and therefore do not pretend to be historical snapshots.
- The range selector changes already-derived dashboard data in the browser;
  switching ranges does not issue another database query.

### 21.5 Controlled selling and inventory removal

**Implementation status: complete (14 August 2026).**

- Each product stores its own ADMIN-configured maximum fixed discount that a
  STAFF user may apply per unit. This allows a higher allowance on a ৳15,000
  phone and a lower or zero allowance on a ৳5,000 phone. Checkout derives the
  STAFF minimum from the line's captured list price; ADMIN and MANAGER selling
  prices remain unrestricted.
- The product form validates the allowance in the browser and again at the
  Server Action boundary. Managers may edit ordinary product details but cannot
  change this ADMIN-only field, including through crafted requests. Checkout
  enforces the product's current allowance both when a draft line is saved and
  inside the final atomic sale transaction, so stale drafts cannot bypass a
  newly tightened limit. Changes remain part of the audited product snapshot.
- Permanent inventory removal is ADMIN-only. Receiving stock remains available
  to operational roles, while the removal navigation, page, serial lookup, and
  mutation all use the separate `REMOVE_STOCK` capability.

### 21.6 Invoice collections and trade-in cash payouts

**Implementation status: complete (24 August 2026).**

- A completed regular sale may be paid, partially paid, or unpaid. Later
  collections append numbered, auditable payment records to the original
  invoice and move its status from UNPAID to PARTIALLY PAID and finally PAID.
  Collection forms share browser and server Zod validation, reject overpayment,
  and require confirmation before recording money.
- Sales use accrual accounting: completing the sale records its immutable
  selling price, revenue, COGS, profit, and stock movement immediately. A later
  partial or final collection changes only the invoice's paid amount, amount
  due, payment status, and collection history; it never rewrites the invoice
  total or financial performance.
- When an accepted trade-in credit exceeds the new sale total, the difference is
  recorded as a **trade-in cash payout** with its own numbered settlement,
  payment method, actor, and audit trail. The sale and trade-in still commit in
  one transaction. EMI continues to prohibit credit/down-payment combinations
  above its total because EMI trade-ins do not use this cash-payout workflow.
- Invoice screens and generated PDFs show the original total, trade-in credit,
  any cash payout, amount paid, and current amount due. Voiding a regular sale
  refunds only money actually collected, not an unpaid receivable.

---

## 22. Still deferred after Phase 9

- **Purchase orders & supplier ledger** — payables, partial deliveries, PO → receipt matching.
- **VAT / tax invoices** — the `taxRate` field (basis points) exists, but legal and numbering requirements must be defined first.
- **Camera barcode scanning** — USB/Bluetooth keyboard scanners are Phase 7.
- **Multi-branch** — requires `Location`, location-aware on-hand invariants, unit locations, transfers, permissions, and reports. Treat this as a separate major phase.
- **Customer returns and exchanges** — distinct from invoice mistake-voiding,
  warranty/RMA, and trade-in acquisition; requires a dedicated post-sale policy.
