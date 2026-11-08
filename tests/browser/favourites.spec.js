import { test, expect } from '@playwright/test';
import { base, harness, setup, screen, favourite, handoffs, focus, refresh } from './remote-helpers.js';

test('remote favourites preserve exact variants, saved order, focus, search and playing actions', async ({ page }) => {
  const errors = await harness(page);
  await setup(page);
  const rows = page.locator('#browse-list .familiar-row');
  const focused = page.locator('#browse-list .familiar-row.focused');
  await page.keyboard.press('ArrowDown');
  await favourite(page);
  await expect(focused).toContainText('Stadium 4K');
  await expect(focused.locator('.favourite-star')).toHaveText('★');
  await page.keyboard.press('ArrowUp');
  await favourite(page);
  expect(await handoffs(page)).toEqual([]);
  await screen(page, 2);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Stadium 4K');
  await expect(rows.nth(1)).toContainText('Stadium HD');
  await expect(page.locator('#right-sidebar')).toHaveClass(/closed/);
  await page.screenshot({ path: test.info().outputPath('familiar-favourites.png') });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#programme-guide')).toContainText('Today on Stadium HD');
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-action')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(focused).toContainText('Stadium HD');
  expect(await handoffs(page)).toEqual([]);
  await screen(page, 1);
  await expect(page.locator('#channel-search')).toBeFocused();
  await page.keyboard.insertText('stadium');
  await page.keyboard.press('ArrowDown');
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('.favourite-star')).toHaveText(['★', '★']);
  await favourite(page, 'Remove favourite');
  await expect(focused).toContainText('Stadium HD');
  await expect(focused.locator('.favourite-star')).toHaveText('');
  await favourite(page);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await handoffs(page)).at(-1)?.url).toBe(`${base}/streams/stadium-hd.m3u8`);
  const before = await handoffs(page);
  const controls = await page.evaluate(() => window.mockControls);
  await page.keyboard.press('ArrowRight');
  await focus(page, '#playing-favourite-btn');
  await expect(page.locator('#playing-favourite-btn')).toHaveText('Remove favourite');
  await page.keyboard.press('Enter');
  await expect(page.locator('#playing-favourite-btn')).toHaveText('Add to favourites');
  await page.keyboard.press('Enter');
  await expect(page.locator('#playing-favourite-btn')).toHaveText('Remove favourite');
  expect(await handoffs(page)).toEqual(before);
  expect(await page.evaluate(() => window.mockControls)).toEqual(controls);
  await page.reload();
  await expect(page.locator('#boot-splash')).toHaveClass(/hidden/);
  await page.keyboard.press('ArrowLeft');
  await screen(page, 2);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Stadium 4K');
  await expect(rows.nth(1)).toContainText('Stadium HD');
  const outline = await focused.evaluate((element) => getComputedStyle(element).outlineColor);
  expect(outline).toBe('rgb(255, 255, 255)');
  await expect(focused).toBeInViewport();
  await favourite(page, 'Remove favourite');
  await expect(focused).toContainText('Stadium HD');
  await favourite(page, 'Remove favourite');
  await expect(page.locator('#browse-list')).toContainText('No favourites available');
  await expect(page.locator('#browse-nav-2')).toBeFocused();
  await screen(page, 0);
  await expect(page.locator('#browse-list .now-card')).toContainText('Harbour United');
  expect(errors).toEqual([]);
});

test('remote group selection, long lists and empty search keep usable focus without tuning', async ({ page }) => {
  const errors = await harness(page);
  await page.route(`${base}/large.m3u`, (route) =>
    route.fulfill({
      contentType: 'audio/x-mpegurl',
      body:
        '#EXTM3U\n' +
        Array.from(
          { length: 75 },
          (_, index) =>
            `#EXTINF:-1 group-title="${index < 60 ? 'Sports' : 'News'}",${index ? `Channel ${index}` : 'Stadium HD — International football with a very long exact stream version and language description'}\n${base}/streams/channel-${index}.m3u8\n`,
        ).join(''),
    }),
  );
  await setup(page, `${base}/large.m3u`);
  await expect(page.locator('#browse-list .focused')).toBeInViewport();
  for (let index = 0; index < 45; index++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('#browse-list .focused')).toContainText('Channel 45');
  await expect(page.locator('#browse-list .focused')).toBeInViewport();
  await favourite(page);
  await expect(page.locator('#browse-list .focused')).toContainText('Channel 45');
  await screen(page, 3);
  for (let index = 0; index < 46; index++) await page.keyboard.press('ArrowUp');
  await expect(page.locator('#browse-group')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#browse-group')).toHaveText('Group: News');
  await expect(page.locator('#browse-list .familiar-row')).toHaveCount(15);
  await expect(page.locator('#browse-list .focused')).toContainText('Channel 60');
  await screen(page, 1);
  await page.keyboard.insertText('missing-name');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#channel-search')).toBeFocused();
  await expect(page.locator('#browse-list')).toContainText('No channels found');
  await page.keyboard.press('Escape');
  await expect(page.locator('#browse-nav-1')).toBeFocused();
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('refresh and secret rotation retain missing exact favourites for their return', async ({ page }) => {
  const errors = await harness(page);
  let secret = 'first';
  let missing = false;
  const upstream = (quality, language) =>
    `https://provider.example/live?quality=${quality}&language=${language}&edition=main&token=${secret}&__hdnea__=${secret}&hdnea=${secret}&hdntl=${secret}&hdnts=${secret}`;
  const stream = (quality, language) =>
    `${base}/proxy/hls/manifest.m3u8?api_password=${secret}&d=${encodeURIComponent(upstream(quality, language))}`;
  await page.route(`${base}/rotating.m3u`, (route) =>
    route.fulfill({
      contentType: 'audio/x-mpegurl',
      body:
        '#EXTM3U\n' +
        [
          ['Stadium HD', 'hd', 'en'],
          ['Stadium 4K', '4k', 'en'],
          ['Stadium Spanish', 'hd', 'es'],
        ]
          .filter(([, quality]) => !missing || quality !== '4k')
          .map(
            ([name, quality, language]) =>
              `#EXTINF:-1 tvg-id="stadium" group-title="Sports",${name}\n${stream(quality, language)}\n`,
          )
          .join(''),
    }),
  );
  await setup(page, `${base}/rotating.m3u`);
  await favourite(page);
  await page.keyboard.press('ArrowDown');
  await favourite(page);
  await page.keyboard.press('ArrowDown');
  await favourite(page);
  await screen(page, 2);
  const rows = page.locator('#browse-list .familiar-row');
  await expect(rows).toHaveCount(3);
  expect(await handoffs(page)).toEqual([]);
  secret = 'rotated';
  await refresh(page);
  await expect(rows).toHaveCount(3);
  await expect(rows.locator('.favourite-star')).toHaveText(['★', '★', '★']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await handoffs(page)).at(-1)?.url).toBe(stream('4k', 'en'));
  await page.keyboard.press('ArrowLeft');
  missing = true;
  await refresh(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Stadium HD');
  await expect(rows.nth(1)).toContainText('Stadium Spanish');
  missing = false;
  await refresh(page);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('Stadium 4K');
  await page.reload();
  await expect(page.locator('#boot-splash')).toHaveClass(/hidden/);
  await page.keyboard.press('ArrowLeft');
  await screen(page, 2);
  await expect(rows).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('two local playlists keep separate favourites even with identical stream URLs', async ({ page }) => {
  const errors = await harness(page);
  await setup(page);
  await favourite(page);
  await screen(page, 4);
  await page.keyboard.press('ArrowRight');
  await focus(page, '#pl-add-btn', 'data-focused');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await focus(page, '#pl-add-url', 'data-focused');
  await page.keyboard.insertText(`${base}/playlist.m3u`);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Second identical source');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await focus(page, '#playlist-entry-1', 'data-focused');
  await page.keyboard.press('Enter');
  await expect(page.locator('#settings-page')).toHaveClass(/hidden/);
  await screen(page, 2);
  await expect(page.locator('#browse-list')).toContainText('No favourites available');
  await screen(page, 3);
  await page.keyboard.press('ArrowDown');
  await favourite(page);
  await screen(page, 2);
  await expect(page.locator('#browse-list .familiar-row')).toHaveCount(1);
  await expect(page.locator('#browse-list .familiar-row')).toContainText('Stadium 4K');
  await screen(page, 4);
  await page.keyboard.press('ArrowRight');
  await focus(page, '#playlist-entry-0', 'data-focused');
  await page.keyboard.press('Enter');
  await screen(page, 2);
  await expect(page.locator('#browse-list .familiar-row')).toHaveCount(1);
  await expect(page.locator('#browse-list .familiar-row')).toContainText('Stadium HD');
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});
