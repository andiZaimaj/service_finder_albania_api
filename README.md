# Service Finder Albania API

NestJS (TypeScript) backend for a marketplace connecting clients with tradespeople in Albania (similar to Taskrabbit / Bark.com).

## Requirements

- Node.js 18+
- PostgreSQL 14+

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables (see below). The repo includes a `.env` template with placeholders.

3. Create the database and set `DATABASE_URL` in `.env`.

4. Apply migrations and generate the Prisma client:

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

   For local development with migration history:

   ```bash
   npx prisma migrate dev
   ```

5. Seed sample data (categories, admin, workers, clients, jobs, proposals):

   ```bash
   npx prisma db seed
   ```

6. Start the API:

   ```bash
   npm run start:dev
   ```

- API base path: `/api`
- OpenAPI (Swagger): [http://localhost:3000/api/docs](http://localhost:3000/api/docs) (default port)
- Health: `GET /api/health`

## Client job flow

Job posts are created by **clients** (`role: CLIENT`), not by workers. Workers can only
respond with proposals.

| Step | Endpoint | Who |
|------|----------|-----|
| 1. Pick a service category | `GET /api/categories` | Public |
| 2. Post the job | `POST /api/jobs` | CLIENT |
| 3. Track own posts + proposal counts | `GET /api/jobs/mine` | CLIENT |
| 4. Read the proposals | `GET /api/jobs/:id/proposals` | CLIENT (owner) |
| 5. Accept one | `POST /api/proposals/:id/accept` | CLIENT (owner) |

`GET /api/jobs/mine` accepts `page`, `limit` (max 100) and `status`
(`OPEN` / `CLOSED` / `EXPIRED`), newest first, and returns a `proposalCount` per job.

Posting rules enforced by `JobsService`:

- The `categoryId` must exist — an unknown one is rejected with `400`, not a database error.
- A job opens as `OPEN` and expires after 30 days (`JobsExpiryScheduler` flips it to `EXPIRED`
  and notifies the client).
- A client may hold at most `MAX_OPEN_JOBS_PER_CLIENT` (10) open posts at once.
- On success, every BASIC/PRO worker whose profile covers the job's **category and city** gets a
  `NEW_JOB` notification. Unpaid workers are skipped because they cannot open the listing anyway.
  A failure in this fan-out is logged and does not fail the post.

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for access tokens (15 minutes) |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (7 days) |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_BASIC_PRICE_ID` | Stripe Price ID for BASIC plan |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for PRO plan |
| `SUPABASE_URL` | Supabase project URL (storage) |
| `SUPABASE_KEY` | Supabase service role (or suitable upload key) |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `APP_URL` | Public API URL (Stripe redirects, links) |
| `FRONTEND_URL` | Web app URL (password reset emails) |
| `EMAIL_FROM` | Optional sender for Resend |
| `PORT` | HTTP port (default `3000`) |

Configure the Stripe webhook endpoint to `POST {APP_URL}/api/subscriptions/webhook` and enable **raw body** handling (already enabled in `main.ts` via `rawBody: true`).

Create a Supabase Storage bucket named `documents` (or adjust the bucket name in `WorkersService`) for national ID uploads.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Dev server with watch |
| `npm run build` | Production build |
| `npm run start:prod` | Run compiled app |
| `npm test` | Unit tests |
| `npm run test:e2e` | E2E tests |
| `npx prisma migrate dev` | Create/apply migrations (dev) |
| `npx prisma migrate deploy` | Apply migrations (CI/prod) |
| `npx prisma db seed` | Run `prisma/seed.ts` |
| `npx prisma generate` | Regenerate Prisma Client |

## Seed users (password: `Password123!`)

- Admin: `admin@example.com`
- Worker BASIC: `worker.basic@example.com`
- Worker PRO: `worker.pro@example.com`
- Clients: `client1@example.com`, `client2@example.com`

## License

Private / UNLICENSED
