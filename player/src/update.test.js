import { describe, it, expect, vi } from 'vitest';
import { compareVersions, checkForUpdate, consentAsked, hasConsented, sendUsagePing } from './update.js';

describe('personal update policy', () => {
  it('ignores upstream consent and cached update links without network requests', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key) =>
        key === 'en_settings'
          ? JSON.stringify({ updateCheck: true })
          : JSON.stringify({ at: Date.now(), latest: '99.0.0', url: 'https://example.invalid/upstream.wgt' }),
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      expect(await checkForUpdate()).toBeNull();
      expect(hasConsented()).toBe(false);
      expect(consentAsked()).toBe(true);
      sendUsagePing();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('compareVersions', () => {
  it('reports equal versions as 0', () => {
    expect(compareVersions('3.2.0', '3.2.0')).toBe(0);
  });

  it('detects newer major/minor/patch releases', () => {
    expect(compareVersions('4.0.0', '3.9.9')).toBeGreaterThan(0);
    expect(compareVersions('3.3.0', '3.2.9')).toBeGreaterThan(0);
    expect(compareVersions('3.2.1', '3.2.0')).toBeGreaterThan(0);
  });

  it('detects older versions as negative', () => {
    expect(compareVersions('3.1.9', '3.2.0')).toBeLessThan(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersions('3.2', '3.2.0')).toBe(0);
  });
});
