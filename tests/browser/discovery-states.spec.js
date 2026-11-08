import { test, expect } from '@playwright/test';
import { harness, setup, screen, handoffs, base } from './remote-helpers.js';
import { discoveryFixtures, instant, currentData } from './discovery-fixtures.js';

test('loading and uncached offline remain playable and Back restores focused filter', async ({ page }) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`${base}/discovery-guide/current**`, async (route) => {
    await delayed;
    await route.abort();
  });
  await setup(page, `${base}/discovery.m3u`);
  await screen(page, 0);
  await expect(page.locator('.discovery-status')).toHaveText('Loading guide…');
  await expect(page.locator('[data-filter="0"]')).toBeFocused();
  release();
  await expect(page.locator('.discovery-status')).toContainText('Guide offline · you can still watch');
  await expect(page.locator('.now-unknown-row')).toHaveCount(7);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#discovery-watch')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.now-unknown-row.focused')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-filter="0"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#browse')).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-filter="0"]')).toBeFocused();
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('local expiry removes Watch before a second OK and today uses timezone-aware bounds', async ({ page }) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  await page.route(`${base}/discovery-guide/current**`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        currentData({
          channels: [
            {
              guideId: 'stadium',
              current: {
                title: 'Finishing now',
                description: 'Brief listing',
                start: new Date(instant - 60000).toISOString(),
                end: new Date(instant + 20000).toISOString(),
              },
            },
          ],
        }),
      ),
    }),
  );
  let interval;
  await page.route(`${base}/discovery-guide/schedule**`, (route) => {
    const url = new URL(route.request().url());
    interval = { from: url.searchParams.get('from'), to: url.searchParams.get('to') };
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'no_listings', listings: [] }),
    });
  });
  await setup(page, `${base}/discovery.m3u`);
  await screen(page, 0);
  await expect(page.locator('.now-card')).toContainText('Finishing now');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#discovery-watch')).toBeFocused();
  await expect(page.locator('.schedule-status')).toContainText('No listings today');
  expect(Date.parse(interval.from)).toBeLessThan(instant);
  expect(Date.parse(interval.to)).toBeGreaterThan(instant);
  expect(interval.from).toMatch(/Z$/);
  await page.clock.fastForward(21000);
  await expect(page.locator('#discovery-watch')).toBeHidden();
  await expect(page.locator('.detail-eyebrow')).toHaveText('Finished');
  await page.keyboard.press('Enter');
  expect(await handoffs(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.now-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('unsupported source and large remote grid window keep complete focus visible', async ({ page }) => {
  const errors = await harness(page);
  await page.route(`${base}/many.m3u`, (route) =>
    route.fulfill({
      contentType: 'audio/x-mpegurl',
      body:
        '#EXTM3U\n' +
        Array.from(
          { length: 75 },
          (_, index) =>
            `#EXTINF:-1 group-title="Sports",${index ? 'Channel ' + index : 'Stadium HD'}\n${base}/streams/${index}.m3u8\n`,
        ).join(''),
    }),
  );
  await setup(page, `${base}/many.m3u`);
  await screen(page, 0);
  await expect(page.locator('.discovery-status')).toContainText('Programme guide unavailable for this source');
  await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 45; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('.now-unknown-row.focused')).toContainText('Channel 45');
  await expect(page.locator('.now-unknown-row')).toHaveCount(30);
  const bounds = await page.locator('.now-unknown-row.focused').boundingBox();
  expect(bounds.y).toBeGreaterThan(0);
  expect(bounds.y + bounds.height).toBeLessThan(1000);
  await page.keyboard.press('Enter');
  await expect(page.locator('#discovery-watch')).toHaveText('Watch Channel 45');
  await page.keyboard.press('Escape');
  await expect(page.locator('.now-unknown-row.focused')).toContainText('Channel 45');
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('large known grid navigates columns and bounded rows without losing rail or card focus', async ({ page }) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  await page.route(`${base}/grid.m3u`, (route) =>
    route.fulfill({
      contentType: 'audio/x-mpegurl',
      body:
        `#EXTM3U en-guide-url="${base}/discovery-guide"\n` +
        Array.from(
          { length: 75 },
          (_, index) =>
            `#EXTINF:-1 tvg-id="grid-${index}" group-title="Sports",${index ? 'Channel ' + index : 'Stadium HD'}\n${base}/streams/${index}.m3u8\n`,
        ).join(''),
    }),
  );
  await page.route(`${base}/discovery-guide/current**`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        currentData({
          channels: Array.from({ length: 75 }, (_, index) => ({
            guideId: 'grid-' + index,
            current: {
              title: 'Live programme ' + index,
              start: new Date(instant - 60000).toISOString(),
              end: new Date(instant + 3600000).toISOString(),
            },
          })),
        }),
      ),
    }),
  );
  await setup(page, `${base}/grid.m3u`);
  await screen(page, 0);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.now-card.focused')).toContainText('Live programme 1');
  await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('.now-card.focused')).toContainText('Live programme 45');
  await expect(page.locator('.now-card')).toHaveCount(30);
  const bounds = await page.locator('.now-card.focused').boundingBox();
  expect(bounds.y).toBeGreaterThan(0);
  expect(bounds.y + bounds.height).toBeLessThan(1000);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#browse-nav-0')).toBeFocused();
  await page.clock.fastForward(1000);
  await expect(page.locator('#browse-nav-0')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.now-card.focused')).toContainText('Live programme 45');
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});
