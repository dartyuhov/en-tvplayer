import { test, expect } from '@playwright/test';
import { harness, setup, screen, handoffs, favourite, base } from './remote-helpers.js';
import { discoveryFixtures, versionUrl, currentData, instant, programme } from './discovery-fixtures.js';

async function programmes(page) {
  await screen(page, 1);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
}

test('Search modes reuse exact favourites and details, restore query/result, and require explicit Watch', async ({
  page,
}) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  await setup(page, `${base}/discovery.m3u`);
  await screen(page, 1);
  await expect(page.getByRole('button', { name: 'Programmes on now', exact: true })).toBeVisible();
  await page.keyboard.insertText('Stadium');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await favourite(page);
  await expect(page.locator('.familiar-row.focused .favourite-star')).toHaveText('★');
  expect(await handoffs(page)).toEqual([]);
  await programmes(page);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('broadcast');
  await expect(page.locator('.search-programme')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#discovery-watch')).toHaveText('Watch Stadium separate ID');
  expect(await handoffs(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.search-programme.focused')).toBeFocused();
  await expect(page.locator('#channel-search')).toHaveValue('broadcast');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Harbour');
  await expect(page.locator('.search-programme')).toHaveCount(1);
  await expect(page.locator('.search-programme')).toContainText('2 versions');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.search-programme.focused')).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('familiar-programme-search.png') });
  await page.keyboard.press('Enter');
  await expect(page.locator('#discovery-watch')).toHaveText('Watch Stadium 4K Polish');
  await page.keyboard.press('Escape');
  await expect(page.locator('.search-programme.focused')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await handoffs(page)).at(-1)?.url).toBe(versionUrl('4k', 'pl'));
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.search-programme.focused')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#channel-search')).toBeFocused();
  await expect(page.locator('#browse')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#channel-search')).toHaveValue('Harbou');
  await page.keyboard.press('Escape');
  await expect(page.locator('#browse')).toBeVisible();
  await expect(page.locator('#browse-nav-1')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#browse')).toBeHidden();
  expect(errors).toEqual([]);
});

test('stale/offline and obsolete guide responses never replace channel search or poll behind details', async ({
  page,
}) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  let state = 'stale',
    requests = 0,
    release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`${base}/discovery-guide/current**`, async (route) => {
    requests++;
    if (state === 'delay') await delayed;
    if (state === 'offline') {
      await route.abort();
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(currentData({ stale: true })) });
  });
  await setup(page, `${base}/discovery.m3u`);
  await programmes(page);
  await page.keyboard.insertText('Harbour');
  await expect(page.locator('.search-status')).toContainText('Guide stale');
  await expect(page.locator('.search-programme')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const before = requests;
  await page.clock.fastForward(120000);
  expect(requests).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('.search-programme.focused')).toBeFocused();
  state = 'offline';
  await page.clock.fastForward(31000);
  await expect(page.locator('.search-status')).toContainText('Guide offline · showing cached listings');
  await expect(page.locator('.search-programme')).toHaveCount(1);
  state = 'delay';
  await page.clock.fastForward(31000);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('News');
  release();
  await expect(page.locator('.familiar-row')).toHaveCount(1);
  await expect(page.locator('.familiar-row')).toContainText('Evening News HD');
  await expect(page.locator('.search-programme')).toHaveCount(0);
  const channelRequests = requests;
  await page.clock.fastForward(120000);
  expect(requests).toBe(channelRequests);
  await page.keyboard.press('ArrowDown');
  await favourite(page);
  expect(await handoffs(page)).toEqual([]);
  expect(await page.evaluate(() => window.mockControls)).toEqual([]);
  expect(errors).toEqual([]);
});

test('unsupported guide leaves Channels usable and Samsung Back key closes input before search', async ({ page }) => {
  const errors = await harness(page);
  await page.route(`${base}/no-guide.m3u`, (route) =>
    route.fulfill({
      contentType: 'audio/x-mpegurl',
      body: `#EXTM3U\n#EXTINF:-1 group-title="Sports",Stadium HD\n${base}/streams/hd.m3u8\n`,
    }),
  );
  await setup(page, `${base}/no-guide.m3u`);
  await programmes(page);
  await page.keyboard.insertText('Stadium');
  await expect(page.locator('.search-status')).toContainText('Programme guide unavailable for this source');
  await expect(page.locator('#browse-list')).toContainText('No programmes on now found');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#channel-search')).toBeFocused();
  await page.locator('#channel-search').dispatchEvent('keydown', { key: 'GoBack', keyCode: 10009, bubbles: true });
  await expect(page.locator('#browse-nav-1')).toBeFocused();
  await expect(page.locator('#browse')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.familiar-row')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await favourite(page);
  await expect(page.locator('.favourite-star')).toHaveText('★');
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('current-only results, shared remembered filters, expiry and empty queries remain remote navigable', async ({
  page,
}) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  await page.route(`${base}/discovery-guide/current**`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        currentData({
          channels: [
            ...currentData().channels,
            { guideId: 'missing', current: programme('Football later', instant + 60000, instant + 120000) },
          ],
        }),
      ),
    }),
  );
  await setup(page, `${base}/discovery.m3u`);
  await favourite(page);
  await programmes(page);
  await expect(page.locator('#browse-list')).toContainText('Enter a programme title');
  await page.keyboard.insertText('later');
  await expect(page.locator('.search-programme')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Post-match');
  await expect(page.locator('.search-programme')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Unknown');
  await expect(page.locator('.search-programme')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('e');
  await expect(page.locator('.search-programme')).toHaveCount(3);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-search-filter="0"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.search-programme')).toHaveCount(2);
  await expect(page.locator('[data-search-filter="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-search-filter="1"]')).toHaveClass(/selected/);
  await expect(page.locator('[data-search-filter="0"]')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.search-programme')).toHaveCount(1);
  await expect(page.locator('[data-search-filter="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-search-filter="2"]')).toHaveClass(/selected/);
  await expect(page.locator('[data-search-filter="1"]')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#discovery-watch')).toHaveText('Watch Stadium HD');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-search-filter="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.search-programme.focused')).toBeFocused();
  await screen(page, 0);
  await expect(page.locator('[data-filter="2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-filter="1"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');
  await screen(page, 1);
  await expect(page.locator('[data-search-filter="1"]')).toHaveAttribute('aria-pressed', 'true');
  await page.clock.fastForward(1800000);
  await expect(page.locator('.search-programme')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#channel-search')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Unknown');
  await expect(page.locator('.familiar-row')).toHaveCount(2);
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});
