# CT Lead Finder (MVP)

Production-oriented MVP for Connecticut lead generation and enrichment.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
- Docker Compose for local Postgres
- Secure custom admin session cookie auth
- AES-GCM encrypted provider secrets (API Hub)

## Features Implemented

- Dashboard with lead and cost cards
- Lead management (`/leads`, `/leads/[id]`) with filters + enrich now
- Google progressive search (`/search/google`) with pre-qual detail gating
- CT registry search (`/search/ct-registry`) using Socrata provider config
- PURPLE V2 bulk enrichment (`/enrich/bulk`) with 3-pass resolver ladder
- Leads export (`/export`) and job export XLSX (`/api/jobs/export?jobId=...`)
- API usage logging + monthly aggregation per provider + global
- API Hub integration manager (`/api-hub`)

## Quick Start

1. `cp .env.example .env`
2. `docker compose up -d`
3. `npm install`
4. `npx prisma migrate dev`
5. `npm run dev`

Open `http://localhost:3000` and sign in with:

- Username: `admin`
- Password: value from `ADMIN_PASSWORD` in `.env`

## API Hub Setup

Go to `/api-hub`.

For each provider card you can:

- Enable/disable integration
- Set base URL
- Edit endpoint templates JSON
- Save key/token secret (encrypted in DB)
- Set rate limit + timeout + default cost
- Test connectivity
- Inspect last 50 calls and last error

### Required fields to activate key features

- Google Places:
  - Enable provider
  - Save Google API key in secret field
  - Keep/adjust templates: `text_search`, `place_details`, `geocode`
- CT Socrata:
  - Enable provider
  - Set `dataset_id` in endpoints JSON
  - Optional app token in secret field

If `APP_ENCRYPTION_KEY` is missing or too short, secret saves are blocked by design.

## Mock Mode

App works with no keys:

- `MOCK_GOOGLE=true` forces deterministic mock Google responses
- Registry search falls back to mock if dataset id is missing
- Demo leads and provider defaults are seeded

## Bulk Enrichment (PURPLE V2)

Route: `/enrich/bulk`

- Upload CSV/XLSX
- Save column mapping
- Run/resume job via `/api/jobs/run?jobId=...`
- Polling status via `/api/jobs/status?jobId=...`
- Export enriched workbook with `AF_` fields via `/api/jobs/export?jobId=...`

Pass ladder:

1. Google resolver (details call gated by pre-qual score >= 65)
2. Website extraction (robots.txt check + 1 req/domain/sec)
3. Directory placeholder + RDAP/generic enrichment hints

## Security Notes

- Provider secrets encrypted using AES-256-GCM and `APP_ENCRYPTION_KEY`
- Secrets are never logged
- Session cookie is HTTP-only, signed with HMAC
- Input validation via Zod
- Upload file type/size checks
- Spreadsheet export sanitizes formula-injection vectors

## Handy Commands

- `npm run dev`
- `npm run lint`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:seed`

