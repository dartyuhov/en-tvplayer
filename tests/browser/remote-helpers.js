import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

export const base = 'http://127.0.0.1:5184';
export async function harness(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      errors.push(`Unexpected external request: ${url.hostname}`);
      await route.abort();
    } else if (url.pathname.includes('/.vite/deps/shaka-player')) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: await readFile(new URL('./mock-shaka.js', import.meta.url), 'utf8'),
      });
    } else await route.continue();
  });
  await page.addInitScript(() => {
    window.mockHandoffs = [];
    window.mockControls = [];
    window.addEventListener('mock-playback-control', (event) => window.mockControls.push(event.detail));
    window.addEventListener('mock-playback-handoff', (event) => window.mockHandoffs.push(event.detail));
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () {
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      window.mockControls.push('pause');
    };
  });
  return errors;
}
export async function focus(page, selector, attribute = 'class') {
  for (let step = 0; step < 30; step++) {
    const value = await page.locator(selector).getAttribute(attribute);
    if (attribute === 'class' ? /\bfocused\b/.test(value || '') : value !== null) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`Remote could not reach ${selector}`);
}
export async function setup(page, url = `${base}/playlist.m3u`) {
  await page.goto('./');
  await expect(page.locator('#onboard-m3u')).toHaveAttribute('data-focused', '');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await focus(page, '#pl-add-url', 'data-focused');
  await page.keyboard.insertText(url);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Fictional stadium');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await focus(page, '#playlist-entry-0', 'data-focused');
  await page.keyboard.press('Enter');
  await expect(page.locator('#settings-page')).toHaveClass(/hidden/);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#browse-list .focused')).toContainText('Stadium HD');
}
export async function screen(page, index) {
  await page.keyboard.press('ArrowLeft');
  await focus(page, `#browse-nav-${index}`);
  await page.keyboard.press('Enter');
}
export async function favourite(page, expected = 'Add to favourites') {
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#favourite-action')).toHaveText(expected);
  await page.keyboard.press('Enter');
  await expect(page.locator('#channel-actions')).toHaveClass(/hidden/);
}
export const handoffs = (page) => page.evaluate(() => window.mockHandoffs);
export async function refresh(page) {
  if (await page.locator('#browse').isVisible()) await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowRight');
  await focus(page, '#refresh-channels-btn');
  await page.keyboard.press('Enter');
  await expect(page.locator('#progress-toast')).toHaveClass(/hidden/);
  await page.keyboard.press('ArrowLeft');
}
