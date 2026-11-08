import { describe, expect, it } from 'vitest';
import { parseM3u } from './utils.js';

describe('guide playlist metadata', () => {
  it('retains exact guide IDs, names, standalone groups and advertised base per channel', () => {
    const channels = parseM3u(`#EXTM3U en-guide-url="https://gateway.example/en-guide/v1?api_password=fictional"
#EXTINF:-1 tvg-id="sport" tvg-name="Sport",Sport HD
#EXTGRP:Sports
https://example.test/hd
#EXTINF:-1 tvg-id="sport" group-title="Other",Sport 4K
#EXTGRP:Sports
https://example.test/4k`);
    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({
      guideId: 'sport',
      guideName: 'Sport',
      group: 'Sports',
      guideUrl: 'https://gateway.example/en-guide/v1?api_password=fictional',
    });
    expect(channels[1]).toMatchObject({ guideId: 'sport', group: 'Other' });
    expect(parseM3u('#EXTM3U\n#EXTINF:-1,Unknown\nhttps://example.test/a')[0].guideUrl).toBeNull();
  });
});
