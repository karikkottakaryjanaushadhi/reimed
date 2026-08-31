# REIMED — pharmacy billing

Next.js app for **multi-store** pharmacies: **POS billing**, **purchases**, **batch + expiry** inventory, **suppliers**, **products**, and **per-store staff** (manager vs cashier). Bills can be printed for **dot-matrix** workflows (monospace browser print + plain-text receipt endpoint).

## Quick start

Requires **PostgreSQL** (see `.env.example`). Local option:

```bash
docker compose up -d db
cp .env.example .env   # adjust passwords if needed
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Default logins (after `db:seed`):

- **Admin:** `admin@19233` / `19233`
- **Cashier:** `cashier@19233` / `19233`

Set `SESSION_SECRET` to a random string of **at least 32 characters** in production (see `.env.example`).

### Database workflow

| Command | Purpose |
|--------|---------|
| `npm run db:migrate` | Create/apply migrations in development (`prisma migrate dev`). |
| `npm run db:deploy` | Apply migrations only (`prisma migrate deploy`) — CI/prod. |
| `npm run db:seed` | **Truncate app tables** and load **`prisma/seed.sql`** (replace this file with your own SQL when restoring from backup). |
| `npm run db:fresh` | `db:deploy` + `db:seed` — empty DB → schema + minimal seed. |
| `npm run db:reset` | Drop DB, re-run migrations, **no** seed (`--skip-seed`). Then run `npm run db:seed` if you want demo data. |

First-time production: run migrations (`db:deploy` or rely on Vercel build), then **`npm run db:seed`** once from a machine that can reach the database (uses `DATABASE_URL`).

## Dot-matrix printing

1. **Browser print:** after a sale, use **Print bill (browser)** or open **Sales → Print**. Use a **monospace** printer driver and narrow paper if needed (layout is ~42 character width).
2. **Plain text:** open **Plain-text receipt** (or `/api/sales/<id>/receipt`). Send that stream to a **Generic / Text Only** or **ESC/P** Windows driver, or save and copy to a serial/USB raw queue on Linux (`lp` with raw).

## Hosting online (Vercel + Supabase)

The app runs on **[Vercel](https://vercel.com)** (Next.js). The database is **PostgreSQL on [Supabase](https://supabase.com)** — Supabase hosts Postgres only.

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → Database**  
   - Copy the **URI** for the **connection pooler** (Transaction mode, port **6543**). Use it as `DATABASE_URL` and append `?pgbouncer=true` if the dashboard does not already include it.  
   - Copy the **direct** Postgres URI (port **5432**) as `DIRECT_URL`. Prisma uses this for migrations; the pooler URL is for runtime queries on serverless (Vercel).

### 2. Vercel

1. Import this repo and use the default **Node** runtime.
2. **Settings → Environment Variables** (Production / Preview as needed):

   | Name | Value |
   |------|--------|
   | `DATABASE_URL` | Supabase **pooler** URI (`…pooler…:6543…`, with `?pgbouncer=true` when required) |
   | `DIRECT_URL` | Supabase **direct** URI (`…:5432…`) |
   | `SESSION_SECRET` | Long random string (32+ characters) |

3. Deploy. **`vercel.json`** runs `prisma migrate deploy` before `npm run build`. After the first successful deploy, run **`npm run db:seed`** locally (with production env vars) or execute **`prisma/seed.sql`** in the Supabase SQL editor so you have users and a starter store.

Local Postgres matches **port 5433** via `docker-compose.yml`.

### EasyTab import (optional)

Put your EasyTab backup SQL at **`data/easytab-backup.sql`**, or pass a path:  
`npm run db:import-easytab /path/to/backup.sql`  
(requires Python 3 and `DATABASE_URL`).

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS  
- Prisma ORM, PostgreSQL (Supabase or Docker locally)  
- JWT session cookie (`jose`), bcrypt passwords  
