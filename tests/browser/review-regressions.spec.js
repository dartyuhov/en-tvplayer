import { test, expect } from '@playwright/test';
import { harness, setup, screen, focus, handoffs, base } from './remote-helpers.js';
import { discoveryFixtures, instant } from './discovery-fixtures.js';

for (const destination of [0, 1]) {
  test(`playlist refresh completing behind ${destination === 0 ? 'On now' : 'Search'} details preserves context`, async ({
    page,
  }) => {
    const errors = await harness(page);
    await discoveryFixtures(page);
    let summaries = 0;
    page.on('request', (request) => {
      if (request.url().includes('/discovery-guide/current')) summaries++;
    });
    await setup(page, `${base}/discovery.m3u`);
    let release;
    const delayed = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(`${base}/discovery.m3u`, async (route) => {
      await delayed;
      await route.fallback();
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await focus(page, '#refresh-channels-btn');
    const requested = page.waitForRequest(`${base}/discovery.m3u`);
    await page.keyboard.press('Enter');
    await requested;
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowLeft');
    await screen(page, destination);
    if (destination === 1) {
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('Harbour');
      await expect(page.locator('.search-programme')).toHaveCount(1);
    } else await expect(page.locator('.now-card')).toHaveCount(3);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#discovery-watch')).toBeFocused();
    const controls = await page.locator('#browse-controls').innerHTML();
    const before = summaries;
    release();
    await expect(page.locator('#progress-toast')).toHaveClass(/hidden/);
    expect(errors).toEqual([]);
    expect(await page.locator('#browse-controls').innerHTML()).toBe(controls);
    await expect(page.locator('#discovery-watch')).toBeFocused();
    await page.clock.fastForward(120000);
    expect(summaries).toBe(before);
    await page.keyboard.press('Escape');
    await expect(page.locator(destination === 0 ? '.now-card.focused' : '.search-programme.focused')).toBeFocused();
    if (destination === 1) await expect(page.locator('#channel-search')).toHaveValue('Harbour');
    expect(await handoffs(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('daily guide crosses programme and freshness boundaries locally and stops hidden updates', async ({ page }) => {
  const errors = await harness(page);
  await discoveryFixtures(page);
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/discovery-guide/schedule')) requests++;
  });
  await setup(page, `${base}/discovery.m3u`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const guide = page.locator('#programme-guide');
  await expect(guide.locator('.guide-row.current')).toContainText('Harbour United');
  const focused = await guide.locator('.guide-row.focused').textContent();
  await page.clock.setSystemTime(new Date(instant + 1800000));
  await page.clock.fastForward(1000);
  await expect(guide.locator('.guide-row.current')).toContainText('Post-match studio');
  await expect(guide.locator('.guide-row').nth(0)).toHaveAttribute('aria-current', 'false');
  await expect(guide.locator('.guide-row').nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(guide.locator('.guide-row.focused')).toHaveText(focused);
  await expect(guide.locator('.guide-time')).not.toContainText('On now');
  await page.clock.setSystemTime(new Date(instant + 7200001));
  await page.clock.fastForward(1000);
  await expect(guide.locator('.guide-status')).toContainText('Guide stale');
  await expect(guide.locator('.guide-row.current')).toHaveCount(0);
  expect(requests).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await guide.innerHTML();
  await page.clock.setSystemTime(new Date(instant));
  await page.clock.fastForward(5000);
  expect(await guide.innerHTML()).toBe(hidden);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(guide.locator('.guide-row.current')).toContainText('Harbour United');
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-action')).toBeFocused();
  const closed = await guide.innerHTML();
  await page.clock.fastForward(10800000);
  expect(await guide.innerHTML()).toBe(closed);
  expect(requests).toBe(1);
  expect(await handoffs(page)).toEqual([]);
  expect(errors).toEqual([]);
});
