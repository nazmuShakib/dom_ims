# Deploy to DOM Cloud without installing packages there

This repository uses DOM Cloud's internal PostgreSQL database. GitHub Actions
installs and builds the application on a native ARM64 runner, then publishes a
small standalone bundle. DOM Cloud downloads that bundle instead of running
`npm ci`, Yarn, pnpm, or `next build` on its memory-limited host.

## One-time setup

1. Push this repository to GitHub. The repository must be public for DOM Cloud
   to download the release without a GitHub access token.
2. Wait for **Actions -> Build DOM Cloud ARM64 bundle** to finish successfully.
   A release named **DOM Cloud ARM64 build** should contain
   `domcloud-arm64.tar.gz`.
3. Provision a new site with `domcloud.initial.yml`. This step is already done
   if the DOM Cloud site and database exist.
4. Store production secrets in `~/.config/dom_ims.env` and link it as described
   below.
5. Paste `domcloud.prebuilt-first.yml` into **Setup -> Deploy**. This downloads
   the matching release, applies Prisma migrations, creates the initial admin,
   and starts the site.
6. After the administrator is created, remove `INITIAL_ADMIN_NAME`,
   `INITIAL_ADMIN_PHONE`, and `INITIAL_ADMIN_PASSWORD` from the private env
   file.

## Private environment file

Create the file once in DOM Cloud WebSSH:

```bash
mkdir -p ~/.config
cp ~/public_html/.env.example ~/.config/dom_ims.env
chmod 600 ~/.config/dom_ims.env
nano ~/.config/dom_ims.env
cd ~/public_html
ln -sfn "$HOME/.config/dom_ims.env" .env.local
```

For DOM Cloud's internal PostgreSQL, put its exact username, password, and
database name in both `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. The URLs are
identical because the local database connection is not pooled. Percent-encode
special password characters such as `@` (`%40`) and `#` (`%23`). Also set the
exact HTTPS site URL in `BETTER_AUTH_URL` and use a strong random
`BETTER_AUTH_SECRET`.

## Normal updates

1. Commit and push changes to `main`.
2. Wait for the ARM64 workflow and release to finish.
3. Run `domcloud.deploy.yml` from DOM Cloud's **Setup -> Deploy** page.

The deployment verifies that the release commit exactly matches the checked-out
Git commit before replacing the running bundle. It keeps secrets outside the
repository, links the bundled runtime dependencies for maintenance scripts, and
runs `prisma migrate deploy` before restarting Passenger.

## Useful checks

Run these from `~/public_html`:

```bash
node --env-file=.env.local .dom-tools/node_modules/prisma/build/index.js migrate status
node --env-file=.env.local --import ./.dom-tools/node_modules/tsx/dist/loader.mjs scripts/verify-postgres.ts
```

DOM Cloud process errors are under **Check -> Check Process Logs**.

## If a deployment stops at the commit check

The GitHub release is older than the repository checkout, usually because the
workflow is still running. Wait for the green Actions result and run the deploy
again. The existing app bundle is not removed until this check passes.
