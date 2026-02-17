# QA Pro Tracker

Production-oriented QA management app built with Next.js 14, Prisma/PostgreSQL, NextAuth (Microsoft Entra ID), OneDrive evidence streaming, and Playwright smoke tests.

## App Routes
- `/dashboard` - QA metrics and trends
- `/projects` - project and environment management
- `/test-cases` - test case catalog and CSV import/export
- `/plans` - test plans and execution coverage
- `/test-runs` - run execution with evidence and defect creation
- `/bugs` - bug workflow board/list with status transitions
- `/reports` - summary metrics and CSV exports

## Stack
- Next.js 14 App Router + TypeScript
- Tailwind CSS + shadcn-style UI primitives
- Prisma ORM + PostgreSQL
- NextAuth (Azure AD provider)
- Zod validation
- Playwright e2e smoke tests
- Docker + docker-compose

## 1) Create Microsoft Entra ID App Registration
1. Open Azure Portal -> Microsoft Entra ID -> App registrations -> New registration.
2. Name: `QA Pro Tracker`.
3. Supported account type: your org default.
4. Redirect URI (Web):
- `http://localhost:3000/api/auth/callback/azure-ad`
5. Create app and copy:
- Application (client) ID
- Directory (tenant) ID
6. Certificates & secrets -> New client secret. Copy the value.

## 2) Add API permissions/scopes
In App registration -> API permissions -> Add permission -> Microsoft Graph (Delegated):
- `openid`
- `profile`
- `email`
- `offline_access`
- `User.Read`
- `Files.Read`
- `Files.Read.All`
- `Sites.Read.All`
Then click **Grant admin consent** for the tenant.

## 3) Fill environment values
Copy `.env.example` to `.env` and set:
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `AZURE_AD_TENANT_ID`
- `GRAPH_SCOPES`

## 4) Start with Docker
```bash
docker compose up --build
```

## 5) Run Prisma migrate + seed
In another shell:
```bash
npx prisma migrate dev --name init
npm run prisma:seed
```

For deploy-only migration script:
```bash
npm run prisma:migrate
```

## 6) Login and run demo flow
1. Open `http://localhost:3000`.
2. Login with Entra ID.
3. Open `Dashboard` for metrics.
4. Open `Test Runs` and execute cases.
5. Attach evidence via local file input or OneDrive picker.
6. Click `Create defect from this failure`.
7. Open `Bugs` to view workflow + evidence playback.
8. Open shareable report from `Test Runs`.

## OneDrive streaming behavior
- Endpoint: `/api/onedrive/stream?driveId=...&itemId=...`
- Supports HTTP `Range` forwarding to Graph for `206 Partial Content`, so HTML5 `<video>` seeking works inside the app.
- If Graph scopes/token are unavailable, OneDrive APIs return clear errors and UI still supports local upload mode.

## Scripts
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run test:e2e`
- `npm run prisma:migrate`
- `npm run prisma:seed`

## GitHub Quick Start
```bash
git clone <your-repo-url>
cd qa-pro-tracker
npm install
npm run dev
```

Open `http://localhost:3000/dashboard` after login, or enable bypass mode for local demo.

## Playwright smoke tests
- Test page load.
- Local-evidence upload endpoint smoke check.

Use local bypass mode for CI/non-Entra tests:
- Set `ENABLE_DEV_AUTH_BYPASS=true`.
