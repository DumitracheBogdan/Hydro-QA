import { expect, test } from 'playwright/test';

test('Inspection details page smoke: 0383e62c-bb73-4133-b55b-181a9f098135', async ({ page }) => {
  const apiFailures: string[] = [];
  const consoleErrors: string[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('localhost:3001')) return;
    if (response.status() >= 400) {
      apiFailures.push(`${response.status()} ${url}`);
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('/visits/inspection/0383e62c-bb73-4133-b55b-181a9f098135', {
    waitUntil: 'networkidle',
    timeout: 90000,
  });

  const urlNow = page.url();
  const hasErrorText = await page.getByText('Error loading inspection details').isVisible().catch(() => false);
  const hasNotFoundText = await page.getByText('Inspection not found').isVisible().catch(() => false);
  const hasLoadingText = await page.getByText('Loading inspection details...').isVisible().catch(() => false);

  const heading = await page.locator('h1').first().textContent().catch(() => null);

  console.log(`FINAL_URL=${urlNow}`);
  console.log(`H1=${heading ?? ''}`);
  console.log(`HAS_ERROR_TEXT=${hasErrorText}`);
  console.log(`HAS_NOT_FOUND_TEXT=${hasNotFoundText}`);
  console.log(`HAS_LOADING_TEXT=${hasLoadingText}`);
  console.log(`API_FAILURES=${apiFailures.length}`);
  if (apiFailures.length) {
    for (const f of apiFailures) console.log(`API_FAIL=${f}`);
  }
  console.log(`CONSOLE_ERRORS=${consoleErrors.length}`);
  if (consoleErrors.length) {
    for (const e of consoleErrors) console.log(`CONSOLE_ERR=${e}`);
  }

  expect(urlNow).toContain('/visits/inspection/0383e62c-bb73-4133-b55b-181a9f098135');
  expect(hasErrorText).toBeFalsy();
  expect(hasNotFoundText).toBeFalsy();
  expect(hasLoadingText).toBeFalsy();
  expect(heading && heading.trim().length > 0).toBeTruthy();
});
