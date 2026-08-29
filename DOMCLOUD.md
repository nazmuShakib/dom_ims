# Deploy to DOM Cloud with GitHub and internal PostgreSQL

This copy uses Prisma's normal PostgreSQL driver. It does not depend on Neon and
is ready for DOM Cloud's localhost PostgreSQL service.

## 1. Push this folder to GitHub

Create a new repository from this folder. Do not commit `.env`, `.env.local`,
`node_modules`, or `.next`. They are already ignored.

## 2. Provision the site and clone the repository

Open `domcloud.initial.yml`, replace the GitHub URL, then paste the YAML into
DOM Cloud's **Setup -> Deploy** page. If the repository is private, attach the
read-only deploy key offered by DOM Cloud.

The initial deployment clones the repository, installs Node 24, enables the
internal PostgreSQL service, and configures NGINX/Passenger. It does not build
the app yet because the database credentials and auth secret must not be stored
in Git.

## 3. Create the private environment file

In DOM Cloud WebSSH, run:

```bash
mkdir -p ~/.config
cp ~/public_html/.env.example ~/.config/dom_ims.env
chmod 600 ~/.config/dom_ims.env
nano ~/.config/dom_ims.env
```

In **Setup -> Database**, copy the exact PostgreSQL username, database name, and
password into both `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. Internal
PostgreSQL is not pooled, so the two URLs should be identical. Percent-encode
URL-special password characters; for example, `@` becomes `%40` and `#` becomes
`%23`.

Also set:

- `DATA_SOURCE=postgres`
- `BETTER_AUTH_SECRET` to the output of `openssl rand -base64 32`
- `BETTER_AUTH_URL` to the site's exact HTTPS URL
- the optional shop/invoice values as needed

Keep `INITIAL_ADMIN_*` only until the first administrator has been created.

## 4. Initialize the database and first administrator

Before running the production deployment (which removes build-only tools), run:

```bash
cd ~/public_html
ln -sfn "$HOME/.config/dom_ims.env" .env.local
npm ci
npm run db:deploy
npm run auth:bootstrap
```

After the administrator is created, delete the three `INITIAL_ADMIN_*` lines
from `~/.config/dom_ims.env`.

## 5. Build and start

Paste `domcloud.deploy.yml` into **Setup -> Deploy**. It links the private env
file, installs exact dependencies, applies all committed Prisma migrations,
builds Next.js, removes build-only dependencies, and restarts Passenger.

## Updating from GitHub

Run `domcloud.deploy.yml` again, or configure it as the DOM Cloud GitHub webhook
task. The private environment file remains outside `public_html`, so cloning or
pulling the repository cannot overwrite its secrets.

## Useful checks

```bash
cd ~/public_html
npm run db:status
npm run db:verify
```

DOM Cloud process errors are available under **Check -> Check Process Logs**.
