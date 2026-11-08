import { test, expect } from '@playwright/test';
import { harness, setup, handoffs, focus, base } from './remote-helpers.js';

test('brief now/next and local daily guide restore menu focus without controlling playback', async ({ page }) => {
  const errors = await harness(page);
  await setup(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#guide-brief')).toContainText('Harbour United');
  await expect(page.locator('#guide-brief')).toContainText('Match analysis');
  await expect.poll(async () => (await handoffs(page)).length).toBe(1);
  const before = await handoffs(page);
  const controls = await page.evaluate(() => window.mockControls);
  await page.keyboard.press('ArrowRight');
  await focus(page, '#playing-guide-btn');
  await page.keyboard.press('Enter');
  const guide = page.locator('#programme-guide');
  await expect(guide).toContainText('Today on Stadium HD');
  await expect(guide.locator('.guide-row.current')).toContainText('Harbour United');
  await expect(guide.locator('.guide-row.focused')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(guide.locator('.guide-description')).toContainText('Studio discussion');
  await expect(guide.getByRole('button', { name: /watch/i })).toHaveCount(0);
  await expect(guide.locator('.guide-row.focused')).toBeInViewport();
  expect(await guide.locator('.guide-row.focused').evaluate((e) => getComputedStyle(e).outlineColor)).toBe(
    'rgb(255, 255, 255)',
  );
  await page.screenshot({ path: test.info().outputPath('familiar-guide.png') });
  await page.keyboard.press('Escape');
  await expect(guide).toHaveClass(/hidden/);
  await expect(page.locator('#playing-guide-btn')).toBeFocused();
  expect(await handoffs(page)).toEqual(before);
  expect(await page.evaluate(() => window.mockControls)).toEqual(controls);
  await expect(page.locator('#guide-brief')).toHaveClass(/hidden/, { timeout: 7000 });
  expect(errors).toEqual([]);
});

test('offline, stale and missing guide states retain playback and ignore late selections', async ({ page }) => {
  const errors = await harness(page);
  await setup(page);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await handoffs(page)).length).toBe(1);
  await page.route(`${base}/guide/schedule**`, (route) => route.abort());
  await page.keyboard.press('ArrowRight');
  await focus(page, '#playing-guide-btn');
  await page.keyboard.press('Enter');
  await expect(page.locator('#programme-guide')).toContainText('Guide offline');
  const before = await handoffs(page);
  await page.keyboard.press('Escape');
  await page.unroute(`${base}/guide/schedule**`);
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`${base}/guide/schedule**`, async (route) => {
    if (new URL(route.request().url()).searchParams.get('id') === 'local') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 'no_matching_id', listings: [], stale: false }),
      });
      return;
    }
    await delayed;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        stale: true,
        updatedAt: new Date(Date.now() - 10800000).toISOString(),
        ageSeconds: 10800,
        status: 'ok',
        listings: [
          {
            title: 'Late old channel',
            start: new Date(Date.now() - 1000).toISOString(),
            end: new Date(Date.now() + 100000).toISOString(),
            description: '',
          },
        ],
      }),
    });
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('#programme-guide')).toContainText('Loading guide');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await focus(page, '#playing-guide-btn');
  await page.keyboard.press('Enter');
  const lateResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/guide/schedule') && new URL(response.url()).searchParams.get('id') === 'stadium',
  );
  release();
  await lateResponse;
  await expect(page.locator('#programme-guide')).toContainText('Today on Local News');
  await expect(page.locator('#programme-guide')).toContainText('No matching guide ID');
  await expect(page.locator('#programme-guide')).not.toContainText('Late old channel');
  await expect.poll(async () => (await handoffs(page)).length).toBe(before.length + 1);
  expect(errors).toEqual([]);
});

test('stale and no-listings schedule states are distinct and restore focused actions', async ({ page }) => {
  const errors = await harness(page);
  await setup(page);
  const stale = true;
  await page.route(`${base}/guide/schedule**`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        updatedAt: new Date(Date.now() - 10800000).toISOString(),
        stale,
        status: 'no_listings',
        listings: [],
      }),
    }),
  );
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#programme-guide')).toContainText('Guide stale · No listings today');
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-action')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#browse-list .focused')).toContainText('Stadium HD');
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});
