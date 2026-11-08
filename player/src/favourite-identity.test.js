import { describe, expect, it } from 'vitest';
import { streamIdentity, favouriteIdentity } from './logic.js';

describe('exact favourite identity', () => {
  it.each(['__hdnea__', 'hdnea', 'hdntl', 'hdnts'])('ignores rotating known CDN token %s only', (token) => {
    const url = `https://provider.example/live?quality=hd&language=en&edition=main&${token}=old`;
    expect(streamIdentity(url)).toBe('https://provider.example/live?edition=main&language=en&quality=hd');
    expect(streamIdentity(url.replace('=old', '=new'))).toBe(streamIdentity(url));
    expect(streamIdentity(url.replace(token, token.toUpperCase()))).toBe(streamIdentity(url));
  });
  it('survives MediaFlow secret and upstream temporary token rotation', () => {
    const wrapped = (secret, token) =>
      `https://gateway.example/proxy/hls/manifest.m3u8?api_password=${secret}&d=${encodeURIComponent(`https://provider.example/live/hd.m3u8?token=${token}&language=en&quality=hd`)}`;
    expect(streamIdentity(wrapped('old', 'one'))).toBe('https://provider.example/live/hd.m3u8?language=en&quality=hd');
    expect(streamIdentity(wrapped('new', 'two'))).toBe(streamIdentity(wrapped('old', 'one')));
  });
  it('keeps quality, language, path, unknown queries and playlist namespaces distinct', () => {
    const hd = { url: 'https://provider.example/live?quality=hd&language=en&edition=main' };
    expect(favouriteIdentity('first', hd)).not.toBe(favouriteIdentity('second', hd));
    for (const url of [
      'https://provider.example/live?quality=4k&language=en&edition=main',
      'https://provider.example/live?quality=hd&language=es&edition=main',
      'https://provider.example/live?quality=hd&language=en&edition=alternate',
      'https://provider.example/other?quality=hd&language=en&edition=main',
    ])
      expect(streamIdentity(url)).not.toBe(streamIdentity(hd.url));
    expect(streamIdentity('https://provider.example/live?api_password=provider-secret&d=meaningful')).toBe(
      'https://provider.example/live?api_password=provider-secret&d=meaningful',
    );
  });
});
