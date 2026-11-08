import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const fixtureBase = 'http://127.0.0.1:5184';

test('remote setup, exact channel handoff, and resume survive reload', async ({ page }) => {
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      externalRequests.push(url.hostname);
      await route.abort();
    } else if (url.pathname.includes('/.vite/deps/shaka-player')) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: await readFile(new URL('./mock-shaka.js', import.meta.url), 'utf8'),
      });
    } else {
      await route.continue();
    }
  });
  await page.addInitScript(() => {
    window.mockHandoffs = [];
    window.addEventListener('mock-playback-handoff', (event) => window.mockHandoffs.push(event.detail));
    // Browser media APIs are inert here; no picture/audio evidence is claimed.
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () {
      return Promise.resolve();
    };
  });

  await page.goto('./');
  await expect(page).toHaveTitle('EN TV Player — Personal build');
  await expect(page.locator('#personal-build-label')).toHaveText('Personal build');
  await expect(page.locator('#onboard-m3u')).toHaveAttribute('data-focused', '');
  await page.keyboard.press('Enter');
  expect(errors).toEqual([]);
  await page.keyboard.press('ArrowRight');
  await remoteFocus(page, '#pl-add-url');
  await page.keyboard.insertText(`${fixtureBase}/playlist.m3u`);
  await page.keyboard.press('Enter');
  await expect(page.locator('#pl-add-name')).toBeFocused();
  await page.keyboard.insertText('Fictional stadium');
  await page.keyboard.press('Enter');
  await expect(page.locator('#playlist-entry-0')).toContainText('Fictional stadium');
  await page.keyboard.press('ArrowRight');
  await remoteFocus(page, '#playlist-entry-0');
  await page.keyboard.press('Enter');
  await expect(page.locator('#settings-page')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.mockHandoffs)).toEqual([]);

  // Fetching a playlist does not tune; select through the basic remote.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#browse')).toBeVisible();
  const focusedChannel = page.locator('#browse-list .channel-item.focused');
  await expect(focusedChannel).toContainText('Stadium HD');
  await expect(focusedChannel).toBeInViewport();
  const focusStyle = await focusedChannel.evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.outlineColor, shadow: style.boxShadow };
  });
  expect(focusStyle.border + focusStyle.shadow).toContain('255, 255, 255');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.mockHandoffs.at(-1)?.url))
    .toBe(`${fixtureBase}/streams/stadium-hd.m3u8`);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.mockHandoffs.at(-1)?.url))
    .toBe(`${fixtureBase}/streams/stadium-4k.m3u8`);

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.mockHandoffs.at(-1)?.url))
    .toBe(`${fixtureBase}/streams/stadium-4k.m3u8`);
  await expect(page.locator('#boot-splash')).toHaveClass(/hidden/);
  await page.keyboard.press('ArrowRight');
  await remoteFocus(page, '#settings-btn', 'class');
  await page.keyboard.press('Enter');
  await expect(page.locator('#playlist-entry-0')).toContainText('Fictional stadium');
  await expect(page.locator('#playlist-entry-0')).toContainText(`${fixtureBase}/playlist.m3u`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await remoteFocus(page, '#toggle-update-check');
  await expect(page.locator('#toggle-update-check')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toggle-update-check')).not.toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

// Move using the app's remote focus model, never click/fill/focus DOM controls.
async function remoteFocus(page, selector, attribute = 'data-focused') {
  for (let step = 0; step < 20; step++) {
    const value = await page.locator(selector).getAttribute(attribute);
    if (attribute === 'class' ? /\bfocused\b/.test(value || '') : value !== null) return;
    await page.keyboard.press('ArrowDown');
  }
  await expect(page.locator(selector)).toHaveAttribute(attribute, attribute === 'class' ? /\bfocused\b/ : '');
}
