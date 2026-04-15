import { chromium } from 'playwright';

export async function settle(page, ms = 800) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

export async function loginUi(page, { webBase, email, password }) {
  await page.goto(`${webBase}/dashboard`);
  await settle(page, 1000);
  if (page.url().includes('/login')) {
    await page.locator('input[name="email"], input[type="email"]').first().fill(email);
    await page.locator('input[name="password"], input[type="password"]').first().fill(password);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 25000 }).catch(() => {});
    await settle(page, 1000);
  }
  return !page.url().includes('/login');
}

export async function launchAuthed({ webBase, email, password, viewport = { width: 1440, height: 900 } }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const ok = await loginUi(page, { webBase, email, password });
  if (!ok) {
    await browser.close();
    throw new Error('Login failed — still on /login after sign-in attempt');
  }
  return { browser, context, page };
}
