# Electronics Shop — Inventory Management System

Phases 0–8 complete: the PostgreSQL inventory layer, catalog UI, stock operations,
Better Auth/RBAC/audit logging, dashboard, command-palette search, and protected
financial reports with CSV/PDF export, scanner workflows, and Warranty/RMA. Full
spec in `PLAN.md`. Stock labels support 38 × 25 mm thermal and A4 adhesive-sheet
printing without duplicating inventory identifiers.
Phase 8 adds reusable customers, discardable server-persisted carts, transactional multi-item
checkout, payment status/method snapshots, and immutable A4/PDF/80 mm invoices.

For shop-PC printer installation and verification, see
[Windows printer setup](docs/windows-printer-setup.md).

## Requirements

- **Node.js 22 LTS** (https://nodejs.org). Next.js 16 needs 20.9+; 22 is recommended.
- A PostgreSQL database. This deployment copy is configured for DOM Cloud's
  internal PostgreSQL service.

## Run it

```bash
npm install
# Copy .env.example to .env.local and enter your PostgreSQL/auth values
npm run db:deploy           # apply committed migrations through the direct URL
npm run auth:bootstrap      # one time only
npm test                    # security, reporting, repository, and UI checks
npm run db:verify           # transactional PostgreSQL smoke test; rolls back
npm run reconcile           # prove every stock count matches its ledger
npm run dev                  # http://localhost:3000
```

## DOM Cloud deployment

Follow [DOMCLOUD.md](DOMCLOUD.md). The included deployment files configure
Node.js 24, NGINX/Passenger, GitHub updates, and DOM Cloud's internal PostgreSQL.

The required production variables are:

- `DATA_SOURCE=postgres`
- `DATABASE_URL` — the internal PostgreSQL connection string
- `DATABASE_URL_UNPOOLED` — the same direct connection string
- `BETTER_AUTH_SECRET` — at least 32 high-entropy characters
- `BETTER_AUTH_URL` — the exact DOM Cloud HTTPS origin
- `SHOP_NAME` — name printed on stock labels (defaults to `Electronics Shop`)
- `SHOP_ADDRESS`, `SHOP_PHONE`, `INVOICE_POLICY` — optional invoice details

`INITIAL_ADMIN_*` variables are only for the one-time bootstrap command and are
not required by the deployed app afterward.

## Development ADMIN password recovery

The emergency recovery command is local-development tooling, not a public
"Forgot password" endpoint. Add `ADMIN_RECOVERY_DATABASE_URL` to `.env.local`
and point it explicitly at the **development** Neon database. It deliberately
does not fall back to the app's normal `DATABASE_URL`.

First inspect the masked account and database target. This invocation is
read-only:

```bash
export ADMIN_RECOVERY_PHONE="01712345678"
npm run auth:recover-admin:dev
```

If the displayed target is correct, enter the new password and run the confirmed
reset:

```bash
read -rsp "New ADMIN password: " ADMIN_RECOVERY_PASSWORD; echo
export ADMIN_RECOVERY_PASSWORD
export CONFIRM_ADMIN_RECOVERY="RESET_DEV_ADMIN"
npm run auth:recover-admin:dev
unset ADMIN_RECOVERY_PHONE ADMIN_RECOVERY_PASSWORD CONFIRM_ADMIN_RECOVERY
```

The password must be 12–128 characters. The command only targets an active,
non-banned ADMIN with exactly one password credential. A successful reset uses
Better Auth's password hasher, revokes every existing session, and adds an audit
entry without storing the password or hash. The same command refuses to run with
`NODE_ENV=production`.

## One-time production business-data reset

This guarded command removes inventory, catalog, customers, carts, sales,
warranty records, sessions, verification records, document sequences, and old
audit entries. It preserves only `users`, password `accounts`, and
`_prisma_migrations`; user name, mobile, role, status, and locale therefore stay
unchanged. The successful reset creates one new audit entry.

Create a Neon production snapshot before proceeding and ensure nobody is using
the app. Enter the pooled production URL without saving it to a file:

```bash
read -rsp "Production pooled URL: " PRODUCTION_RESET_DATABASE_URL; echo
export PRODUCTION_RESET_DATABASE_URL
npm run db:clear-business-data:production
```

That first invocation is read-only. Review the database fingerprint, preserved
users, and per-table deletion counts. If they are correct, copy the exact
fingerprint printed by the command and run:

```bash
export CONFIRM_PRODUCTION_DATA_RESET="DELETE_ALL_PRODUCTION_BUSINESS_DATA"
export CONFIRM_PRODUCTION_DATABASE="the-exact-host/database-fingerprint-shown-above"
npm run db:clear-business-data:production
unset PRODUCTION_RESET_DATABASE_URL CONFIRM_PRODUCTION_DATA_RESET CONFIRM_PRODUCTION_DATABASE
```

The reset is one transaction and uses `TRUNCATE ... RESTRICT`: an unclassified
future table makes it fail safely instead of being deleted through `CASCADE`.
All sessions are removed, so every preserved user must sign in again.

## What's here

```
src/
  domain/types.ts        entity types (mirror the Prisma schema)
  schemas/index.ts       Zod — the validation boundary
  lib/money.ts           integer paisa. never floats.
  lib/ids.ts             UUIDv7, generated app-side
  lib/auth.ts            Better Auth configuration
  lib/session.ts         database-backed session + current role checks
  lib/audit.ts           append-only audit writer
  lib/search.ts          exact serial-first, role-filtered inventory search
  lib/report-export.ts   shared CSV/PDF export matrix
  repositories/
    types.ts             ⭐ storage-independent contracts
    prisma/              transaction-aware PostgreSQL implementation
    json/                legacy Phase 0 implementation (local only)
    index.ts             DATA_SOURCE backend selector
  services/stock.ts      ⭐ THE CORE — receiveStock, recordStockOut, reconcile
  services/dashboard.ts  ledger-derived dashboard metrics and alerts
  services/reports.ts    seven ledger-derived financial reports
  services/warranty.ts   claim workflow + transactional inventory outcomes
scripts/
  reconcile.ts           read-only database/ledger comparison
  seed.ts                legacy JSON-only demo data
prisma/schema.prisma     PostgreSQL schema and relationships
src/proxy.ts             coarse cookie redirect (not authorization)
```

## ⚠️ Two things to know

1. **Use `DATA_SOURCE=postgres` outside legacy JSON development.** JSON writes do
   not work on serverless filesystems.
2. **Stock only ever moves via the ledger.** There is no `adjustStock()` method,
   on purpose. See `CLAUDE.md`.

## Try this

1. `npm run dev`, open http://localhost:3000.
2. Create a category, brand, supplier, and a SERIAL product through the catalog.
3. **Receive stock** → pick that product and paste serials one per line. The
   units appear on the product page, each with its own cost.
4. **Stock out** → type one of those serials. The app finds the device and tells you
   what it is. Record the sale, and the exact profit appears against that unit —
   no FIFO, no averaging, because the unit carries its own cost.
5. **Movement ledger** → hit "Reverse" on that sale. The original entry stays put and
   a correction is written beneath it. The unit goes back into stock. There is no
   delete button anywhere, on purpose.
6. **Reconciliation** → on-hand vs SUM(ledger), for every product. It should say the
   books add up. That is the invariant the whole system rests on.
7. Sign in as a STAFF account. Cost prices, stock valuation and the profit column
   are not hidden with CSS; they are absent from the server payload and HTML.
8. Click the topbar search or press `Ctrl+K` / `⌘K`. Search a product or enter an
   exact IMEI to jump directly to that physical unit.
9. As ADMIN or MANAGER, open **Reports**, apply filters, and export the identical
   result as CSV or PDF. STAFF cannot access report pages or export endpoints.
10. Open **Warranty / RMA**, scan a sold serial, and create a claim. Intake and
    custody changes do not move stock; only a manager-approved return, write-off,
    or replacement writes linked ledger movements.
11. Receive stock and use **Print labels** from the success message, or open
    **Stock → Print labels** to scan, select, preview, and reprint 38 × 25 mm
    Code 128 labels.
12. Open **Checkout**, scan or manually select several products, choose one saved
    customer or walk-in, record payment details, adjust selling prices if needed,
    and complete the cart atomically. Reprint the immutable invoice as A4,
    downloadable PDF, or 80 mm thermal output.

## Next

Returns/refunds, purchase orders, VAT invoices, camera scanning, and multi-branch
inventory remain deferred. See `PLAN.md`.
