# Shift Scheduler

A shift-scheduling web app for technician teams, with a bilingual (Hebrew/English) UI. Admins define weekly
schedules (morning/evening shifts across four stations), technicians submit availability constraints, and
admins can auto-generate, edit, and publish weekly schedules while tracking absences.

Built with Next.js (App Router), Prisma, and JWT-based session auth.

## Local development

```bash
npm install
npx prisma db push
npm run dev
```

The app runs at `http://localhost:3000`.

### Corporate TLS-inspecting proxies

If `npm install`, `prisma generate`, or `prisma db push` fail with TLS/certificate errors (common behind
corporate proxies that intercept HTTPS), set the following once per shell before running Node/npm/npx commands
(requires Node 22+):

```bash
# bash
export NODE_OPTIONS='--use-system-ca'
```

```powershell
# PowerShell
$env:NODE_OPTIONS='--use-system-ca'
```

Without this, Prisma engine downloads and database pushes can fail silently or with opaque certificate errors.

## Environment variables

| Variable       | Description                                                            |
| -------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL` | Connection string for the database (SQLite file path locally, Postgres/Neon URL in production). |
| `JWT_SECRET`   | Secret used to sign/verify session JWTs. Use a long random value in production. |

## Database provider: SQLite (dev) vs Postgres (production)

`prisma/schema.prisma` is checked in with `provider = "sqlite"`, which is what local development and the test
suite use. Production deploys (Vercel + Neon) flip this to `provider = "postgresql"` before building/deploying.

**To run tests or develop locally, the provider in `prisma/schema.prisma` must be `sqlite`.** If you've pulled a
branch or commit where it was switched to `postgresql` for deployment, switch it back to `sqlite` locally and run
`npx prisma db push` again before running `npm test` or `npm run dev`.

## Deploying (Vercel + Neon)

1. Create a Neon Postgres database and note its connection string.
2. In the Vercel project settings, set the `DATABASE_URL` (Neon connection string) and `JWT_SECRET` environment
   variables.
3. Set `prisma/schema.prisma`'s datasource provider to `postgresql` for the deploy.
4. Create the database tables either by running `npx prisma db push` against the Neon database, or by executing
   the generated DDL in `neon-setup.sql` directly against it (useful when you want an auditable, explicit
   migration script instead of relying on `db push`).
5. The production branch is `master`.

## Security note: bootstrap admin

The initial admin email is hardcoded in `src/lib/config.ts` (`ADMIN_EMAIL`). After the first deploy, **that
email must register an account immediately.** Until it does, anyone who learns the bootstrap admin address could
register with it and claim the admin account. Treat the first-deploy window as sensitive and register the
bootstrap admin account as soon as the app is reachable.

Also note: admin-role changes (granting or revoking admin) are read from the session JWT, which is only
re-issued at login. A revoked admin's existing session can remain valid for up to the JWT's lifetime (30 days) —
if you need immediate revocation, the affected user's session must be invalidated separately (e.g. by rotating
`JWT_SECRET`, which invalidates all sessions).
