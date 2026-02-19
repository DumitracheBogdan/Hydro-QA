# Hydro QA Tracker (Standalone)

This repository contains the standalone QA tracker app used by QA/Dev teams.

## What is included

- `index.html`: UI (frontend)
- `server.js`: backend API proxy to GitHub Issues
- shared team cases (all users see same issues, no per-user GitHub login in UI)
- OneDrive/SharePoint media URL previews (attachments)
- strict team mode (`TEAM_MODE_REQUIRED = true`)

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Set server environment variable:

```bash
# Linux/macOS
export GITHUB_TOKEN=<your_token>

# PowerShell
$env:GITHUB_TOKEN="<your_token>"
```

Optional:

```bash
export GITHUB_OWNER=DumitracheBogdan
export GITHUB_REPO=Hydro-QA
```

3. Start app:

```bash
npm start
```

Open `http://localhost:3000`.

## Team shared mode (recommended)

The backend (`server.js`) uses one shared GitHub token on the server.

Each app user opens the tracker directly, no personal GitHub auth required in UI.

Current default is strict team mode.  
If backend API is unavailable, create/edit actions are blocked to avoid local-only data splits.

## Azure deployment (low/zero extra budget)

Deploy this as a Node app (App Service or existing company backend host) and set:

- `GITHUB_TOKEN`
- (optional) `GITHUB_OWNER`, `GITHUB_REPO`

Then expose it under your company route (example `/qa`).
