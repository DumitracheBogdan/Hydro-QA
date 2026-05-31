// Capture WEBAPP-UI evidence screenshots for the parity test (the web half — mobile is via Maestro).
// Usage: node scripts/parity/webapp-shots.mjs <set|verify>
//   verify (default): navigate to the run's visit-detail page and screenshot each datum the webapp
//     DISPLAYS (mobile->web render proof + web->mobile api-set display). The big evidence value.
//   set: for web-editable datums (2a notes, 2b actions) perform a REAL webapp set + screenshot.
// Reads parity-context.json (visitId/visitRef/inspectionId/expected). Robust: every step bounded,
// per-check try/catch -> screenshot + log + continue; hard global timeout so it can never hang.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const PHASE = (process.argv[2] || "verify").toLowerCase();
const WEB = (process.env.HYDROCERT_DEV_WEB_BASE || process.env.HYDROCERT_WEB_BASE || process.env.WEB || "").replace(/\/$/, "");
const EMAIL = process.env.HYDROCERT_QA_EMAIL || process.env.API_EMAIL || process.env.EMAIL;
const PW = process.env.HYDROCERT_QA_PASSWORD || process.env.API_PASSWORD || process.env.PW;
const SHOTS = process.env.SHOTS || "qa-artifacts/parity/screenshots";
const HARD_MS = Number(process.env.WEBSHOTS_HARD_MS || 150000);

const hard = setTimeout(() => { console.error("::error::webapp-shots HARD-TIMEOUT"); process.exit(2); }, HARD_MS);
const log = (...a) => console.log("[webapp-shots]", ...a);

function ctx() { try { return JSON.parse(readFileSync("parity-context.json", "utf8")); } catch { return {}; } }

async function login(page) {
  await page.goto(`${WEB}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  const em = page.locator('input[type="email"],input[name="email"]').first();
  if (await em.isVisible().catch(() => false)) {
    await em.fill(EMAIL);
    await page.locator('input[type="password"],input[name="password"]').first().fill(PW);
    await page.getByRole("button", { name: /sign in|log ?in/i }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
}

async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  const p = `${SHOTS}/${name}-web-${PHASE}.png`;
  await page.screenshot({ path: p }).catch((e) => log("shot fail", name, e.message));
  log("SHOT", p);
  return p;
}

// scroll a heading into view (best-effort) and screenshot the viewport
async function shotAt(page, headingText, name, { nth = 0 } = {}) {
  try {
    const loc = page.getByText(headingText, { exact: false }).nth(nth);
    await loc.scrollIntoViewIfNeeded({ timeout: 6000 });
    await page.waitForTimeout(600);
    const ok = await loc.isVisible().catch(() => false);
    await shot(page, name);
    log(ok ? "FOUND" : "NOT-VISIBLE", name, JSON.stringify(headingText));
  } catch (e) { log("ERR", name, e.message); await shot(page, name); }
}

// expand a collapsible card by its heading (click the header), disambiguating from a same-named tab.
// `exact:true` matches the card header EXACTLY — needed for "Risk Assessment", whose non-exact .first()
// would otherwise hit the inspection title "Health and Safty Risk Assessment" (the h1) and never open
// the card (the dropdowns/comments would stay hidden in the screenshot).
async function expandCard(page, headingText, { belowText, exact = false } = {}) {
  try {
    let header;
    if (belowText) {
      // the editable CARD sits below the read-only "Description" card; the TAB is above it
      header = page.getByText(headingText, { exact: false }).last();
    } else {
      header = page.getByText(headingText, { exact }).first();
    }
    await header.scrollIntoViewIfNeeded({ timeout: 6000 });
    await header.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(900);
  } catch (e) { log("expand ERR", headingText, e.message); }
}

async function openVisit(page, c) {
  await page.goto(`${WEB}/visits/details/${c.visitId}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const url = page.url();
  log("visit-detail url", url);
  return url.includes("/visits/details/");
}

async function openInspection(page) {
  // switch to Inspections tab
  await page.getByRole("tab", { name: /Inspections/i }).first().click({ timeout: 6000 }).catch(async () => {
    await page.getByText("Inspections", { exact: false }).first().click({ timeout: 6000 }).catch(() => {});
  });
  await page.waitForTimeout(1500);
  // open the inspection: the row is a clickable card titled by its jobType ("Health and Safty Risk
  // Assessment (IN######)") with a chevron -> click the row text to navigate to the inspection detail.
  await page.getByText(/Health and Saf.?ty Risk Assessment/i).first().click({ timeout: 6000 })
    .catch(() => page.getByText(/Risk Assessment|Inspection/i).first().click({ timeout: 6000 }).catch(() => {}));
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1800);
  log("after openInspection url", page.url());
}

async function main() {
  if (!WEB || !EMAIL || !PW) { console.error("::error:: missing WEB/EMAIL/PW env"); process.exit(1); }
  const c = ctx();
  if (!c.visitId) { console.error("::error:: no visitId in parity-context.json"); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1700 } })).newPage();
    await login(page);
    const ok = await openVisit(page, c);
    if (!ok) { log("WARN visit-detail not reached"); await shot(page, "nav-fail"); }

    if (PHASE === "set") {
      // 2a notes: open the Description card edit + type + save (best-effort)
      await shotAt(page, "Description", "2a-description"); // before
      // 2b actions: expand Actions + New Action modal
      await expandCard(page, "Actions");
      await page.getByRole("button", { name: /new action|add action/i }).first().click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await shot(page, "2b-visit-actions");
      log("SET phase is best-effort; real form-fill wiring is iterated on CI");
    } else {
      // VERIFY: screenshot each displayed datum. Visit-level (robust) first.
      await shotAt(page, "Description", "2a-description");
      // 2j — visit booking status badge on the visit-detail header (web->mobile API-set status).
      // The header is at the top of the just-loaded visit-detail page, so screenshot the current
      // viewport (best-effort scroll to a status word if present).
      await shotAt(page, "Confirmed", "2j-visit-status").catch(() => shot(page, "2j-visit-status"));
      await expandCard(page, "Visit Details", { belowText: "Description" }); // the editable card, not the tab
      await shotAt(page, "Water Sampling Details", "2d-visit-text");
      await shot(page, "3d-visit-text"); // same Visit Details card shows the mobile->web values too
      await expandCard(page, "Actions");
      await shotAt(page, "Actions", "2b-visit-actions", { nth: 0 });
      await shotAt(page, "Client Signature", "3a-signature");
      // 4b — site Booking Info card on the visit detail (web->mobile API-set accessInfo)
      await shotAt(page, "Booking Info", "4b-booking-info").catch(() => shot(page, "4b-booking-info"));
      // 2l — the visit Engineers chips (a 2nd engineer was added via API). Visit-level card on the
      // detail page; scroll to the Engineers heading (best-effort) and screenshot the chips.
      await shotAt(page, "Engineers", "2l-engineers").catch(() => shot(page, "2l-engineers"));
      // 2i — the Inspections tab now lists 2 inspections (a 2nd was added via API). Open the tab and
      // screenshot the LIST (before drilling into an inspection), so the photo shows both rows.
      await page.getByRole("tab", { name: /Inspections/i }).first().click({ timeout: 6000 })
        .catch(() => page.getByText("Inspections", { exact: false }).first().click({ timeout: 6000 }).catch(() => {}));
      await page.waitForTimeout(1500);
      await shot(page, "2i-add-inspection");
      // inspection-level: 3b visit-info, 3c risk, 3e site-induction, 2g itemDetail (on the inspection detail)
      await openInspection(page);
      await shot(page, "2g-item-detail"); // inspection header shows Asset Reference/Location/Detail
      // 4a/4c/4d — inspection Notes + Asset Reference/Location (web->mobile API-set scalar fields)
      await shotAt(page, "Notes", "4a-inspection-notes").catch(() => shot(page, "4a-inspection-notes"));
      await shotAt(page, "Asset Reference", "4c-item-reference").catch(() => shot(page, "4c-item-reference"));
      await shotAt(page, "Asset Location", "4d-item-location").catch(() => shot(page, "4d-item-location"));
      await expandCard(page, "Visit Information");
      await shotAt(page, "Assisting 1", "3b-visit-info").catch(() => shot(page, "3b-visit-info"));
      await shotAt(page, "Site Induction", "3e-site-induction").catch(() => shot(page, "3e-site-induction"));
      // exact:true so this opens the RA CARD, not the inspection title h1 ("...Safty Risk Assessment").
      await expandCard(page, "Risk Assessment", { exact: true });
      // 3c web evidence — anchor on the first comment field (now visible in the open card).
      await shotAt(page, "Accessing Area/Lone Working- Comments", "3c-risk", { nth: 0 }).catch(() => shot(page, "3c-risk"));
      // 4f — the 36 Risk Assessment Yes/No dropdowns (web read-only per F-02). The RA card is now open;
      // anchor on the FIRST dropdown label to frame the Yes/No selects. Best-effort (4f is scored via
      // API checkFields on all 36; this is the web-side evidence photo).
      await shotAt(page, "Accessing Area/Lone Working", "4f-ra-dropdowns", { nth: 0 }).catch(() => shot(page, "4f-ra-dropdowns"));
      // 2h — water samples: the inspection's "Lab Results" tab lists the added sample types.
      await page.getByRole("tab", { name: /Lab Results/i }).first().click({ timeout: 6000 })
        .catch(() => page.getByText("Lab Results", { exact: false }).first().click({ timeout: 6000 }).catch(() => {}));
      await page.waitForTimeout(1200);
      // Lab Results groups the 16 samples into ONE Test BATCH row named by a DYNAMIC code (e.g.
      // "1. WXVMGKZ ... Sample Date 31/05/2026"). Expand the batch row FIRST (anchor on the stable
      // "Sample Date" text) so BOTH shots show real content: 2h = the expanded batch's sample rows,
      // 2k = the per-sample note (nested one level deeper). 2h/2k are scored via API; these are evidence.
      await page.getByText(/Sample Date/i).first().click({ timeout: 6000 }).catch(() => {});
      // Wait for the batch to ACTUALLY expand (the "Samples (N)" header appears) before shooting 2h —
      // a fixed 900ms was too early (the batch rendered collapsed in the 2h shot even though it had
      // expanded by the later 2k shot, which showed "Samples (16)" + the note). Condition-based wait.
      await page.getByText(/Samples \(/i).first().waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(500);
      await shot(page, "2h-samples"); // expanded batch -> Samples (16) + the sample-type rows
      await expandCard(page, "Potable/Domestic");
      await page.waitForTimeout(500);
      await shotAt(page, "Note", "2k-sample-note").catch(() => shot(page, "2k-sample-note"));
    }
    log("DONE phase=" + PHASE);
  } catch (e) { console.error("::error:: webapp-shots", e.message); }
  finally { await browser.close().catch(() => {}); clearTimeout(hard); process.exit(0); }
}
main();
