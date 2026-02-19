# Hydro QA Tracker (Standalone)

This repository contains the standalone QA tracker app used by QA/Dev teams.

## What is included

- `index.html`: full QA tracker UI and logic
- SharePoint List cloud mode (shared data for team)
- OneDrive/SharePoint media URL previews
- team-shared enforcement (`TEAM_MODE_REQUIRED = true`)

## Run locally

Open `index.html` directly in the browser, or run a static server:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500/index.html`.

## Team shared mode (recommended)

To make all team members see the same issues, use SharePoint List cloud mode:

1. Create a SharePoint List with columns used in `SP_FIELDS` from `index.html`.
2. Create an Azure App Registration with Microsoft Graph delegated permission:
   - `Sites.ReadWrite.All`
3. In `index.html`, fill `GRAPH_CONFIG`:
   - `tenantId`
   - `clientId`
   - `siteId`
   - `listId`
4. In app header click `Connect SharePoint`.

Current default is strict team mode.  
If SharePoint is not configured/connected, create/edit actions are blocked to avoid local-only data splits.

## Azure deployment (low/zero extra budget)

Deploy as static app on Azure Static Web Apps (Free tier), or host under your company app route (e.g. `/qa`).
