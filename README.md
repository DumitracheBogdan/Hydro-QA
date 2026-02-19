# Hydro QA Tracker (Standalone)

This repository contains the standalone QA tracker app used by QA/Dev teams.

## What is included

- `index.html`: full QA tracker UI and logic
- GitHub Issues cloud mode (shared data for team)
- OneDrive/SharePoint media URL previews (attachments)
- team-shared enforcement (`TEAM_MODE_REQUIRED = true`)

## Run locally

Open `index.html` directly in the browser, or run a static server:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500/index.html`.

## Team shared mode (recommended)

To make all team members see the same issues, use GitHub Issues cloud mode:

1. In `index.html`, set `GITHUB_CONFIG`:
   - `owner`
   - `repo`
2. Each user clicks `Connect GitHub` in the app.
3. Paste a GitHub token that has issue access for the repo:
   - Fine-grained token permissions:
     - Repository access: `Hydro-QA`
     - Issues: `Read and write`
   - or classic token with `repo` scope.

Current default is strict team mode.  
If GitHub is not connected, create/edit actions are blocked to avoid local-only data splits.

## Azure deployment (low/zero extra budget)

Deploy as static app on Azure Static Web Apps (Free tier), or host under your company app route (e.g. `/qa`).
