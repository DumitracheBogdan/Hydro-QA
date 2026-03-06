import { test } from 'playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type ActionStatus = 'clicked' | 'failed' | 'skipped';

type ActionLog = {
  route: string;
  label: string;
  controlType: string;
  beforeUrl: string;
  afterUrl: string;
  status: ActionStatus;
  error?: string;
};

const BASE_ORIGIN = 'http://localhost:5173';
const KNOWN_MENU_ENTRIES = [
  'Dashboard',
  'Customers',
  'Schedule',
  'Visits List',
  'Team Management',
  'Settings',
];
const SEED_ROUTES = [
  '/dashboard',
  '/customers',
  '/schedule',
  '/planner',
  '/visits',
  '/visits-list',
  '/team-management',
  '/settings',
];
const MAX_ROUTES = 32;
const MAX_PASSES_PER_ROUTE = 3;
const MAX_CONTROLS_PER_ROUTE = 140;
const MAX_TOTAL_ACTIONS = 450;

function cleanText(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/\s+/g, ' ').trim();
}

function normalizeUrl(urlLike: string): string | null {
  try {
    const parsed = new URL(urlLike, BASE_ORIGIN);
    if (parsed.origin !== BASE_ORIGIN) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function compactError(error: unknown): string {
  return String(error).replace(/\s+/g, ' ').slice(0, 280);
}

test.setTimeout(30 * 60 * 1000);
test.use({
  launchOptions: {
    slowMo: Number(process.env.QA_SLOWMO ?? '120'),
  },
});

test('Manual QA walkthrough - click all visible controls', async ({ page, context }) => {
  const actionLogs: ActionLog[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const apiFailures: string[] = [];
  const visitedRoutes = new Set<string>();
  const queuedRoutes: string[] = [];
  const clickedKeyByRoute = new Set<string>();
  const seenMenuEntries = new Set<string>();
  let fatalError = '';

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      apiFailures.push(`${response.status()} ${response.url()}`);
    }
  });

  context.on('page', async (newPage) => {
    try {
      await newPage.waitForLoadState('domcontentloaded', { timeout: 4000 });
      await newPage.close();
    } catch {
      // Best effort cleanup for popups opened by links.
    }
  });

  const enqueue = (url: string | null) => {
    if (!url) return;
    if (visitedRoutes.has(url)) return;
    if (queuedRoutes.includes(url)) return;
    if (visitedRoutes.size + queuedRoutes.length >= MAX_ROUTES) return;
    queuedRoutes.push(url);
  };

  const snapshotRoutesFromDom = async () => {
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((elements) =>
        elements
          .map((el) => (el as HTMLAnchorElement).getAttribute('href') || '')
          .filter(Boolean),
      )
      .catch(() => [] as string[]);
    for (const href of hrefs) {
      enqueue(normalizeUrl(href));
    }
  };

  const recordAction = (entry: ActionLog) => {
    actionLogs.push(entry);
    const message = `${entry.status.toUpperCase()} | ${entry.route} | ${entry.controlType} | ${entry.label} | ${entry.beforeUrl} -> ${entry.afterUrl}${entry.error ? ` | ${entry.error}` : ''}`;
    console.log(message);
  };

  const tryClickKnownMenuEntries = async () => {
    const isDisabledControl = async (locatorRef: ReturnType<typeof page.locator>) => {
      return locatorRef
        .evaluate((node) => {
          const elem = node as HTMLElement;
          const nativeDisabled = (elem as HTMLButtonElement).disabled === true;
          const ariaDisabled = elem.getAttribute('aria-disabled') === 'true';
          const attrDisabled = elem.hasAttribute('disabled');
          const style = window.getComputedStyle(elem);
          const pointerEventsNone = style.pointerEvents === 'none';
          return nativeDisabled || ariaDisabled || attrDisabled || pointerEventsNone;
        })
        .catch(() => true);
    };

    for (const menuEntry of KNOWN_MENU_ENTRIES) {
      if (seenMenuEntries.has(menuEntry)) continue;
      const candidates = [
        page.getByRole('link', { name: menuEntry, exact: true }).first(),
        page.getByRole('button', { name: menuEntry, exact: true }).first(),
        page
          .locator('a,button,[role="button"]')
          .filter({ hasText: new RegExp(`^\\s*${menuEntry}\\s*$`, 'i') })
          .first(),
      ];

      let menuControl: ReturnType<typeof page.locator> | null = null;
      for (const candidate of candidates) {
        const visible = await candidate.isVisible().catch(() => false);
        if (!visible) continue;
        const disabled = await isDisabledControl(candidate);
        if (disabled) continue;
        menuControl = candidate;
        break;
      }
      if (!menuControl) continue;

      const beforeUrl = page.url();
      try {
        await menuControl.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {});
        await menuControl.click({ trial: true, timeout: 1500 });
        await menuControl.click({ timeout: 2500 });
        await page.waitForLoadState('networkidle', { timeout: 3500 }).catch(() => {});
        await page.waitForTimeout(220);
        const afterUrl = page.url();
        seenMenuEntries.add(menuEntry);
        enqueue(normalizeUrl(afterUrl));
        recordAction({
          route: beforeUrl,
          label: menuEntry,
          controlType: 'menu',
          beforeUrl,
          afterUrl,
          status: 'clicked',
        });
      } catch (error) {
        recordAction({
          route: beforeUrl,
          label: menuEntry,
          controlType: 'menu',
          beforeUrl,
          afterUrl: page.url(),
          status: 'failed',
          error: compactError(error),
        });
      }
    }
  };

  const clickVisibleControlsOnCurrentRoute = async () => {
    const route = page.url();
    for (let pass = 0; pass < MAX_PASSES_PER_ROUTE; pass += 1) {
      if (actionLogs.length >= MAX_TOTAL_ACTIONS) break;
      const controls = page.locator(
        'button, [role="button"], a[href], input[type="button"], input[type="submit"]',
      );
      const count = Math.min(await controls.count().catch(() => 0), MAX_CONTROLS_PER_ROUTE);
      let clickedInPass = false;

      for (let i = 0; i < count; i += 1) {
        if (actionLogs.length >= MAX_TOTAL_ACTIONS) break;
        if (page.isClosed()) break;

        const control = controls.nth(i);
        const visible = await control.isVisible().catch(() => false);
        if (!visible) continue;

        const meta = await control
          .evaluate((node) => {
            const elem = node as HTMLElement;
            const tag = elem.tagName.toLowerCase();
            const text = (elem.textContent || '').replace(/\s+/g, ' ').trim();
            const aria = elem.getAttribute('aria-label') || '';
            const title = elem.getAttribute('title') || '';
            const id = elem.id || '';
            const href = tag === 'a' ? (elem as HTMLAnchorElement).getAttribute('href') || '' : '';
            const role = elem.getAttribute('role') || '';
            const nativeDisabled = (elem as HTMLButtonElement).disabled === true;
            const ariaDisabled = elem.getAttribute('aria-disabled') === 'true';
            const attrDisabled = elem.hasAttribute('disabled');
            const style = window.getComputedStyle(elem);
            const pointerEventsNone = style.pointerEvents === 'none';
            return {
              tag,
              text,
              aria,
              title,
              id,
              href,
              role,
              disabled: nativeDisabled || ariaDisabled || attrDisabled || pointerEventsNone,
            };
          })
          .catch(() => ({
            tag: 'unknown',
            text: '',
            aria: '',
            title: '',
            id: '',
            href: '',
            role: '',
            disabled: false,
          }));

        if (meta.disabled) continue;

        const label =
          cleanText(meta.text) ||
          cleanText(meta.aria) ||
          cleanText(meta.title) ||
          cleanText(meta.id) ||
          cleanText(meta.href) ||
          `unnamed-${meta.tag}`;

        const clickKey = `${route}|${meta.tag}|${label}`;
        if (clickedKeyByRoute.has(clickKey)) continue;
        clickedKeyByRoute.add(clickKey);

        const beforeUrl = page.url();
        try {
          await control.scrollIntoViewIfNeeded({ timeout: 900 }).catch(() => {});
          await control.click({ trial: true, timeout: 1200 });
        } catch (error) {
          recordAction({
            route,
            label,
            controlType: meta.role || meta.tag,
            beforeUrl,
            afterUrl: page.url(),
            status: 'skipped',
            error: `not-interactable: ${compactError(error)}`,
          });
          continue;
        }

        try {
          await control.click({ timeout: 2200 });
          await page.waitForLoadState('networkidle', { timeout: 2600 }).catch(() => {});
          await page.waitForTimeout(180);
          await page.keyboard.press('Escape').catch(() => {});

          const afterUrl = page.url();
          enqueue(normalizeUrl(afterUrl));
          if (meta.href) {
            enqueue(normalizeUrl(meta.href));
          }

          recordAction({
            route,
            label,
            controlType: meta.role || meta.tag,
            beforeUrl,
            afterUrl,
            status: 'clicked',
          });
          clickedInPass = true;
        } catch (error) {
          recordAction({
            route,
            label,
            controlType: meta.role || meta.tag,
            beforeUrl,
            afterUrl: page.url(),
            status: 'failed',
            error: compactError(error),
          });
        }

        if (page.url() !== route) {
          await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 3500 }).catch(() => {});
          await page.waitForTimeout(140);
        }
      }

      if (!clickedInPass) break;
    }
  };

  try {
    await page.goto(BASE_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});
    await page.waitForTimeout(350);

    enqueue(normalizeUrl(page.url()));
    for (const seedRoute of SEED_ROUTES) {
      enqueue(normalizeUrl(`${BASE_ORIGIN}${seedRoute}`));
    }

    await tryClickKnownMenuEntries();
    await snapshotRoutesFromDom();

    while (
      queuedRoutes.length > 0 &&
      visitedRoutes.size < MAX_ROUTES &&
      actionLogs.length < MAX_TOTAL_ACTIONS &&
      !page.isClosed()
    ) {
      const route = queuedRoutes.shift() as string;
      if (visitedRoutes.has(route)) continue;
      visitedRoutes.add(route);

      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 6500 }).catch(() => {});
      await page.waitForTimeout(280);

      await tryClickKnownMenuEntries();
      await snapshotRoutesFromDom();
      await clickVisibleControlsOnCurrentRoute();
      await snapshotRoutesFromDom();
    }
  } catch (error) {
    fatalError = compactError(error);
    console.log(`FATAL_ERROR=${fatalError}`);
  } finally {
    const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
    const artifactDir = path.join(process.cwd(), 'qa-artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    const outputPath = path.join(artifactDir, `manual-qa-full-${timestamp}.json`);

    const summary = {
      baseOrigin: BASE_ORIGIN,
      visitedRoutes: Array.from(visitedRoutes),
      visitedRouteCount: visitedRoutes.size,
      clickedActions: actionLogs.filter((a) => a.status === 'clicked').length,
      failedActions: actionLogs.filter((a) => a.status === 'failed').length,
      skippedActions: actionLogs.filter((a) => a.status === 'skipped').length,
      menuEntriesSeen: Array.from(seenMenuEntries),
      apiFailures,
      consoleErrors,
      pageErrors,
      fatalError,
      actions: actionLogs,
    };

    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`QA_ARTIFACT=${outputPath}`);
    console.log(`VISITED_ROUTE_COUNT=${summary.visitedRouteCount}`);
    console.log(`CLICKED_ACTIONS=${summary.clickedActions}`);
    console.log(`FAILED_ACTIONS=${summary.failedActions}`);
    console.log(`SKIPPED_ACTIONS=${summary.skippedActions}`);
    console.log(`API_FAILURES=${summary.apiFailures.length}`);
    console.log(`CONSOLE_ERRORS=${summary.consoleErrors.length}`);
    console.log(`PAGE_ERRORS=${summary.pageErrors.length}`);
    console.log(`FATAL_ERROR=${summary.fatalError || 'none'}`);
  }
});
