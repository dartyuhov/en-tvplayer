import { test, expect } from '@playwright/test';
import { harness, setup, screen, handoffs, base, focus } from './remote-helpers.js';
import { discoveryFixtures, currentData, programme } from './discovery-fixtures.js';

async function titleSearch(page, text) {
  await screen(page, 1);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText(text);
}

test('programme search bounds long rows, restores a nonfirst result and excludes hidden streams', async ({ page }) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  const titles = Array.from(
    { length: 75 },
    (_, index) =>
      `Live programme ${index} — A very long international championship title with English commentary and extended coverage`,
  );
  await page.route(`${base}/search-many.m3u`, (route) =>
    route.fulfill({
      contentType: 'audio/x-mpegurl',
      body:
        `#EXTM3U en-guide-url="${base}/discovery-guide"\n` +
        titles
          .map(
            (_, index) =>
              `#EXTINF:-1 tvg-id="row-${index}" group-title="${index < 60 ? 'Sports' : 'News'}",${index ? 'Channel ' + index : 'Stadium HD'}\n${base}/streams/${index}.m3u8\n`,
          )
          .join(''),
    }),
  );
  await page.route(`${base}/discovery-guide/current**`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        currentData({
          channels: titles.map((title, index) => ({ guideId: 'row-' + index, current: programme(title) })),
        }),
      ),
    }),
  );
  await setup(page, `${base}/search-many.m3u`);
  await titleSearch(page, 'Live programme');
  await page.keyboard.press('ArrowDown');
  for (let index = 0; index < 45; index++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('.search-programme.focused')).toContainText('Live programme 45');
  await expect(page.locator('.search-programme')).toHaveCount(30);
  const bounds = await page.locator('.search-programme.focused').boundingBox();
  expect(bounds.y).toBeGreaterThan(0);
  expect(bounds.y + bounds.height).toBeLessThan(1000);
  expect(bounds.x + bounds.width).toBeLessThan(1920);
  expect(
    await page.locator('.search-programme.focused').evaluate((element) => getComputedStyle(element).outlineColor),
  ).toBe('rgb(255, 255, 255)');
  await page.screenshot({ path: test.info().outputPath('familiar-long-search-rows.png') });
  await page.keyboard.press('Enter');
  await expect(page.locator('#programme-details h1')).toHaveText(titles[45]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.search-programme.focused')).toContainText('Live programme 45');
  await expect(page.locator('.search-programme.focused')).toBeFocused();
  await page.clock.fastForward(1000);
  await expect(page.locator('.search-programme.focused')).toContainText('Live programme 45');
  await screen(page, 4);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await focus(page, '#show-group-1', 'data-focused');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowLeft');
  await screen(page, 1);
  await expect(page.locator('.search-programme')).toHaveCount(15);
  await expect(page.locator('.search-programme').first()).toContainText('Live programme 60');
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('loading, uncached offline and unavailable cache keep query focus and channel search accessible', async ({
  page,
}) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  let unavailable = false;
  await page.route(`${base}/discovery-guide/current**`, async (route) => {
    if (!unavailable) {
      await delayed;
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(currentData({ channels: [], cacheStatus: 'unavailable' })),
    });
  });
  await setup(page, `${base}/discovery.m3u`);
  await titleSearch(page, 'Harbour');
  await expect(page.locator('.search-status')).toContainText('Loading guide');
  await expect(page.locator('#channel-search')).toBeFocused();
  release();
  await expect(page.locator('.search-status')).toContainText('Guide offline · you can still watch');
  await expect(page.locator('.search-programme')).toHaveCount(0);
  unavailable = true;
  await page.clock.fastForward(31000);
  await expect(page.locator('.search-status')).toContainText('Guide unavailable');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Stadium');
  await expect(page.locator('.familiar-row')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await handoffs(page)).length).toBe(1);
  expect(errors).toEqual([]);
});
