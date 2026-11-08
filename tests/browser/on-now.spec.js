import { test, expect } from '@playwright/test';
import { harness, setup, screen, handoffs, favourite, base, focus } from './remote-helpers.js';
import { discoveryFixtures, currentData, instant, versionUrl, live, next } from './discovery-fixtures.js';

test('On now opens details before explicit exact-version Watch and restores card focus', async ({ page }) => {
  const errors = await harness(page);
  await setup(page);
  await screen(page, 0);
  const cards = page.locator('.now-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Harbour United');
  await expect(cards.first()).toContainText('2 versions');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const details = page.getByRole('dialog', { name: 'Programme details' });
  await expect(details).toBeVisible();
  await expect(details.getByRole('button', { name: 'Watch Stadium HD' })).toBeFocused();
  expect(await handoffs(page)).toEqual([]);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(details.getByRole('button', { name: 'Watch Stadium 4K' })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('familiar-details.png') });
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await handoffs(page)).length).toBe(1);
  expect((await handoffs(page))[0].url).toContain('/streams/stadium-4k.m3u8');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.now-card.focused')).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('familiar-on-now.png') });
  expect(errors).toEqual([]);
});

test('remembered filters, exact ordered favourites, three-column long-title layout and future descriptions', async ({
  page,
}) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  await setup(page, `${base}/discovery.m3u`);
  await page.keyboard.press('ArrowDown');
  await favourite(page);
  await page.keyboard.press('ArrowUp');
  await favourite(page);
  await screen(page, 0);
  await expect(page.locator('.now-card')).toHaveCount(3);
  await expect(page.locator('.now-unknown-row')).toHaveCount(3);
  const boxes = await page.locator('.now-card').evaluateAll((cards) =>
    cards.map((card) => {
      const r = card.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right };
    }),
  );
  expect(boxes[0].y).toBe(boxes[2].y);
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  expect(boxes[2].right).toBeLessThan(1920);
  await page.screenshot({ path: test.info().outputPath('familiar-three-column.png') });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.now-card')).toHaveCount(2);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.now-card')).toHaveCount(1);
  await expect(page.locator('.now-card')).toContainText('2 versions');
  await expect(page.locator('[data-filter="2"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#discovery-watch')).toHaveText('Watch Stadium 4K Polish');
  await expect(page.locator('#discovery-watch')).toBeFocused();
  await expect(page.locator('.detail-programme')).toHaveCount(2);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.detail-description')).toHaveText('Future discussion description.');
  await expect(page.locator('#discovery-watch')).toBeHidden();
  expect(await handoffs(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('familiar-future-details.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('.now-card.focused')).toBeFocused();
  await expect(page.locator('[data-filter="2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await handoffs(page)).at(-1)?.url).toBe(versionUrl('4k', 'pl'));
  await page.reload();
  await expect(page.locator('#boot-splash')).toHaveClass(/hidden/);
  await page.keyboard.press('ArrowLeft');
  await screen(page, 0);
  await expect(page.locator('[data-filter="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.now-card')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('current expiry, stale/offline retention, bounded requests and obsolete results preserve Back focus', async ({
  page,
}) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  let requests = 0;
  let mode = 'fresh';
  let release;
  const delay = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`${base}/discovery-guide/current**`, async (route) => {
    requests++;
    if (mode === 'delay') await delay;
    if (mode === 'offline') {
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        currentData(
          mode === 'stale'
            ? {
                stale: true,
                updatedAt: new Date(instant - 10800000).toISOString(),
              }
            : {},
        ),
      ),
    });
  });
  await setup(page, `${base}/discovery.m3u`);
  await screen(page, 0);
  await expect(page.locator('.now-card')).toHaveCount(3);
  expect(requests).toBe(1);
  mode = 'stale';
  await page.clock.fastForward(31000);
  await expect(page.locator('.discovery-status')).toContainText('Guide stale');
  mode = 'offline';
  await page.clock.fastForward(31000);
  await expect(page.locator('.discovery-status')).toContainText('Guide offline · showing cached listings');
  await page.clock.fastForward(1800000);
  await expect(page.locator('.now-card')).toHaveCount(0);
  await expect(page.locator('.now-unknown-row')).toHaveCount(7);
  await screen(page, 3);
  const before = requests;
  await page.clock.fastForward(120000);
  expect(requests).toBe(before);
  mode = 'delay';
  await screen(page, 0);
  await expect(page.locator('.discovery-status')).toContainText('Loading guide');
  await screen(page, 3);
  await expect(page.locator('#browse-list .focused')).toContainText('Stadium HD');
  release();
  await page.clock.fastForward(1000);
  await expect(page.locator('#browse-title')).toHaveText('Channels');
  await expect(page.locator('#browse-list .focused')).toContainText('Stadium HD');
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('unknown streams remain individually playable; last-used language and missing/late schedule are isolated', async ({
  page,
}) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  await setup(page, `${base}/discovery.m3u`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await handoffs(page)).length).toBe(1);
  await page.keyboard.press('ArrowLeft');
  await screen(page, 0);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#discovery-watch')).toHaveText('Watch Stadium 4K Polish');
  await page.keyboard.press('Escape');
  let release;
  const delay = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`${base}/discovery-guide/schedule**`, async (route) => {
    await delay;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ listings: [{ ...live, title: 'Obsolete schedule' }, next] }),
    });
  });
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.now-unknown-row.focused')).toContainText('Unknown Sports HD');
  await page.keyboard.press('Enter');
  await expect(page.locator('.schedule-status')).toHaveText('No matching guide ID');
  await expect(page.locator('#discovery-watch')).toHaveText('Watch Unknown Sports HD');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#discovery-watch')).toHaveText('Watch Unknown Sports 4K');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.schedule-status')).toContainText('Loading guide');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  release();
  await expect(page.locator('.schedule-status')).toHaveText('No matching guide ID');
  await expect(page.locator('#programme-details')).not.toContainText('Obsolete schedule');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await handoffs(page)).at(-1)?.url).toBe(`${base}/streams/unknown-4k.m3u8`);
  expect(errors).toEqual([]);
});

test('hidden provider groups are excluded from discovery and exact favourites', async ({ page }) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  await setup(page, `${base}/discovery.m3u`);
  await favourite(page);
  await screen(page, 4);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await focus(page, '#show-group-1', 'data-focused');
  await page.keyboard.press('Enter');
  await expect(page.locator('#show-group-1')).not.toHaveClass(/\bon\b/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowLeft');
  await screen(page, 0);
  await expect(page.locator('.now-card')).toHaveCount(1);
  await expect(page.locator('.now-card')).toContainText('Evening News');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.now-card')).toHaveCount(0);
  await expect(page.locator('#browse-list')).toContainText('No channels in this filter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.now-card')).toHaveCount(0);
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});
