# Power Automate + Teams: Nightly QA Report Setup Guide

This guide walks you through setting up an automatic Teams notification that posts
the nightly regression test results to your group chat every morning.

---

## How It Works

1. **GitHub Actions** runs the nightly regression tests at 3 AM Romania time.
2. When tests finish, the workflow sends a JSON summary to a **Power Automate webhook**.
3. Power Automate receives the JSON and posts a nicely formatted **Adaptive Card**
   to your Teams group chat.

---

## Prerequisites

- A Microsoft 365 account with access to Power Automate
- Permission to post in the target Teams group chat
- Admin access to the Hydro-QA GitHub repository (to add secrets)

---

## Step-by-Step Setup

### Step 1: Open Power Automate

Go to [https://make.powerautomate.com](https://make.powerautomate.com) and sign in
with your Microsoft account.

### Step 2: Create a New Flow

1. Click **+ Create** in the left sidebar.
2. Select **Instant cloud flow**.
3. Give it a name, for example: `Hydrocert Nightly QA to Teams`.
4. Under "Choose how to trigger this flow", select **When an HTTP request is received**.
5. Click **Create**.

### Step 3: Configure the HTTP Trigger

In the trigger step ("When an HTTP request is received"), paste the following JSON
schema into the **Request Body JSON Schema** field:

```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "environment": { "type": "string" },
    "mode": { "type": "string" },
    "date": { "type": "string" },
    "totals": {
      "type": "object",
      "properties": {
        "total": { "type": "integer" },
        "pass": { "type": "integer" },
        "fail": { "type": "integer" },
        "skip": { "type": "integer" }
      }
    },
    "failedTests": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "suite": { "type": "string" },
          "id": { "type": "string" },
          "test": { "type": "string" }
        }
      }
    },
    "links": {
      "type": "object",
      "properties": {
        "runUrl": { "type": "string" },
        "excelArtifact": { "type": "string" },
        "bundleArtifact": { "type": "string" }
      }
    }
  }
}
```

### Step 4: Add the Teams Action

1. Click **+ New step**.
2. Search for **"Post adaptive card in a chat or channel"** (Microsoft Teams).
3. Configure it:
   - **Post as**: Flow bot
   - **Post in**: Group chat
   - **Group chat**: Select your QA group chat from the dropdown
   - **Adaptive Card**: Paste the card template below (Step 5)

### Step 5: Paste the Adaptive Card Template

Copy and paste this entire JSON block into the **Adaptive Card** field.

In Power Automate, you will need to replace the placeholder values with dynamic
content from the trigger. The placeholders below show which field to map:

- `@{triggerBody()?['date']}` -- click in the field and select **date** from
  Dynamic content
- `@{triggerBody()?['environment']}` -- select **environment**
- `@{triggerBody()?['totals']?['total']}` -- select **total** under totals
- And so on for each dynamic value

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "auto",
          "items": [
            {
              "type": "TextBlock",
              "text": "\uD83E\uDDEA",
              "size": "Large"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "Hydrocert Nightly QA Report",
              "weight": "Bolder",
              "size": "Medium",
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": "@{triggerBody()?['date']}  |  ENV: @{triggerBody()?['environment']}  |  Mode: @{triggerBody()?['mode']}",
              "spacing": "None",
              "isSubtle": true,
              "wrap": true
            }
          ]
        }
      ]
    },
    {
      "type": "ColumnSet",
      "separator": true,
      "spacing": "Medium",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "TOTAL",
              "horizontalAlignment": "Center",
              "isSubtle": true,
              "size": "Small"
            },
            {
              "type": "TextBlock",
              "text": "@{triggerBody()?['totals']?['total']}",
              "horizontalAlignment": "Center",
              "weight": "Bolder",
              "size": "ExtraLarge"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "PASSED",
              "horizontalAlignment": "Center",
              "isSubtle": true,
              "size": "Small",
              "color": "Good"
            },
            {
              "type": "TextBlock",
              "text": "@{triggerBody()?['totals']?['pass']}",
              "horizontalAlignment": "Center",
              "weight": "Bolder",
              "size": "ExtraLarge",
              "color": "Good"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "FAILED",
              "horizontalAlignment": "Center",
              "isSubtle": true,
              "size": "Small",
              "color": "Attention"
            },
            {
              "type": "TextBlock",
              "text": "@{triggerBody()?['totals']?['fail']}",
              "horizontalAlignment": "Center",
              "weight": "Bolder",
              "size": "ExtraLarge",
              "color": "Attention"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "SKIPPED",
              "horizontalAlignment": "Center",
              "isSubtle": true,
              "size": "Small",
              "color": "Warning"
            },
            {
              "type": "TextBlock",
              "text": "@{triggerBody()?['totals']?['skip']}",
              "horizontalAlignment": "Center",
              "weight": "Bolder",
              "size": "ExtraLarge",
              "color": "Warning"
            }
          ]
        }
      ]
    },
    {
      "type": "Container",
      "separator": true,
      "spacing": "Medium",
      "items": [
        {
          "type": "TextBlock",
          "text": "Failed Tests",
          "weight": "Bolder",
          "color": "Attention",
          "$when": "@{greater(triggerBody()?['totals']?['fail'], 0)}"
        },
        {
          "type": "ColumnSet",
          "columns": [
            { "type": "Column", "width": "1", "items": [{ "type": "TextBlock", "text": "Suite", "weight": "Bolder", "size": "Small" }] },
            { "type": "Column", "width": "1", "items": [{ "type": "TextBlock", "text": "ID", "weight": "Bolder", "size": "Small" }] },
            { "type": "Column", "width": "2", "items": [{ "type": "TextBlock", "text": "Test", "weight": "Bolder", "size": "Small" }] }
          ],
          "$when": "@{greater(triggerBody()?['totals']?['fail'], 0)}"
        },
        {
          "type": "TextBlock",
          "text": "All tests passed!",
          "color": "Good",
          "weight": "Bolder",
          "horizontalAlignment": "Center",
          "size": "Medium",
          "$when": "@{equals(triggerBody()?['totals']?['fail'], 0)}"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "Download Full Report",
      "url": "@{triggerBody()?['links']?['excelArtifact']}"
    },
    {
      "type": "Action.OpenUrl",
      "title": "View Run",
      "url": "@{triggerBody()?['links']?['runUrl']}"
    }
  ]
}
```

**Important note about the failed tests table:**

The Adaptive Card above shows the table header and the "All tests passed!" message
conditionally using the `$when` property. However, Power Automate Adaptive Cards
do not natively support looping over an array to create table rows.

To show individual failed tests, add an **Apply to each** action in Power Automate
*before* the Post Adaptive Card step:

1. Click **+ New step** (before the Post card step).
2. Search for **"Apply to each"**.
3. In the "Select output from previous steps" field, choose **failedTests** from
   Dynamic content.
4. Inside the loop, use **"Append to string variable"** to build an HTML or text
   table of failed tests.
5. Then reference that string variable inside the Adaptive Card's failed tests
   section.

Alternatively, for a simpler approach, you can build the entire Adaptive Card JSON
dynamically using a **Compose** action. This is more advanced but gives full control.
If you need help with this, ask your developer to set it up.

### Step 6: Copy the Webhook URL

1. **Save** the flow by clicking **Save** at the top.
2. Go back to the trigger step ("When an HTTP request is received").
3. You will now see a field called **HTTP POST URL** -- click the copy button next
   to it.
4. Keep this URL safe. Anyone with this URL can trigger your flow.

### Step 7: Add the URL as a GitHub Secret

1. Go to your **Hydro-QA** repository on GitHub.
2. Click **Settings** (tab at the top).
3. In the left sidebar, click **Secrets and variables** then **Actions**.
4. Click **New repository secret**.
5. Name: `TEAMS_WEBHOOK_URL`
6. Value: Paste the URL you copied from Step 6.
7. Click **Add secret**.

That is it. The next time the nightly regression runs, the results will
automatically appear in your Teams group chat.

---

## Testing the Setup

To test without waiting for the nightly schedule:

1. Go to the **Hydro-QA** repository on GitHub.
2. Click **Actions** tab.
3. Select **Nightly Regression (DEV)** from the left sidebar.
4. Click **Run workflow**.
5. Choose mode (standard or full) and click the green **Run workflow** button.
6. Wait for the run to finish -- you should see the card appear in your Teams chat.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No card appears in Teams | Check the Power Automate flow run history for errors. Go to [make.powerautomate.com](https://make.powerautomate.com), open your flow, and click "Run history". |
| Webhook returns error in GitHub Actions | Verify the `TEAMS_WEBHOOK_URL` secret is set correctly. The URL should start with `https://prod-...logic.azure.com`. |
| Card appears but data is wrong | Check the JSON schema in the trigger step matches the schema shown in Step 3 above. |
| Flow runs but Teams action fails | Make sure the Flow bot has permission to post in the group chat. Try removing and re-adding the Teams action. |

---

## Alternative Approach: Scheduled Flow (No Webhook)

If you prefer not to use the webhook approach, you can create a **scheduled flow**
that pulls the latest results from GitHub on its own. This is simpler to set up
but has a slight delay (it polls rather than being pushed to).

### How It Works

Instead of GitHub pushing results to Power Automate, Power Automate pulls the
latest nightly run results from GitHub every weekday morning at 8 AM.

### Setup

1. Go to [https://make.powerautomate.com](https://make.powerautomate.com).
2. Click **+ Create** then **Scheduled cloud flow**.
3. Set the name: `Hydrocert Morning QA Report`.
4. Set the schedule:
   - **Starting**: today's date
   - **Repeat every**: 1 Day
   - **On these days**: Monday, Tuesday, Wednesday, Thursday, Friday
   - **At these hours**: 8
   - **At these minutes**: 0
   - **Time zone**: (UTC+02:00) Bucharest *(this automatically adjusts for
     summer/winter time)*
5. Click **Create**.

### Add the Steps

**Step A: Get the Latest Nightly Run from GitHub**

1. Add a new step: search for **HTTP**.
2. Configure it:
   - **Method**: GET
   - **URI**: `https://api.github.com/repos/YOUR_ORG/Hydro-QA/actions/workflows/nightly-regression.yml/runs?per_page=1&status=completed`
   - **Headers**:
     - `Accept`: `application/vnd.github+json`
     - `Authorization`: `Bearer YOUR_GITHUB_PAT`
     - `X-GitHub-Api-Version`: `2022-11-28`

   Replace `YOUR_ORG` with your GitHub organization name and `YOUR_GITHUB_PAT`
   with a GitHub Personal Access Token that has `actions:read` permission on
   the repo.

**Step B: Parse the GitHub Response**

1. Add a new step: search for **Parse JSON**.
2. In **Content**, select **Body** from the HTTP step.
3. Paste this schema:

```json
{
  "type": "object",
  "properties": {
    "workflow_runs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "html_url": { "type": "string" },
          "conclusion": { "type": "string" },
          "created_at": { "type": "string" },
          "run_number": { "type": "integer" }
        }
      }
    }
  }
}
```

**Step C: Get the Run Artifacts**

1. Add a new step: **HTTP** (GET).
2. URI: `https://api.github.com/repos/YOUR_ORG/Hydro-QA/actions/runs/@{first(body('Parse_JSON')?['workflow_runs'])?['id']}/artifacts`
3. Use the same headers as Step A.

**Step D: Post to Teams**

1. Add a new step: **Post adaptive card in a chat or channel**.
2. Use a simplified card that shows:
   - The run date (from `created_at`)
   - The run conclusion (success/failure)
   - A link to the full run on GitHub (from `html_url`)
   - A link to download artifacts

This approach is simpler but does not include the detailed pass/fail counts
or individual failed test names. For the full detailed card, use the webhook
approach described in the main guide above.

### Pros and Cons

| | Webhook Approach | Scheduled Approach |
|---|---|---|
| **Detail level** | Full details (counts, failed tests) | Basic (pass/fail only) |
| **Timing** | Immediate after test run | Fixed schedule (8 AM) |
| **Setup complexity** | Moderate | Simple |
| **GitHub secret needed** | Yes (webhook URL) | No (uses PAT in flow) |
| **Maintenance** | Low | Need to rotate PAT periodically |
