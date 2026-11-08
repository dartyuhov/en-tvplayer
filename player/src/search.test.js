import { describe, it, expect } from 'vitest';
import { programmeSearch } from './logic.js';

describe('programme-title search', () => {
  const now = Date.parse('2026-11-07T18:30:00Z');
  const listing = (title, start, end) => ({ title, start, end });
  const channels = [
    { name: 'Match HD', url: 'https://example.test/hd', guideId: 'match', group: 'Sports' },
    { name: 'Match 4K', url: 'https://example.test/4k', guideId: 'match', group: 'News' },
    { name: 'Other exact ID', url: 'https://example.test/case', guideId: 'Match', group: 'Sports' },
    { name: 'Future football', url: 'https://example.test/future', guideId: 'future' },
    { name: 'Expired football', url: 'https://example.test/expired', guideId: 'expired' },
    { name: 'Unknown football', url: 'https://example.test/unknown' },
    { name: 'Invalid football', url: 'https://example.test/invalid', guideId: 'invalid' },
  ];
  const data = {
    channels: [
      {
        guideId: 'match',
        current: listing('Football live', '2026-11-07T19:30:00+01:00', '2026-11-07T20:30:00+01:00'),
        next: listing('Studio football', '2026-11-07T19:30:00Z', '2026-11-07T20:00:00Z'),
      },
      { guideId: 'Match', current: listing('Football separate', '2026-11-07T18:00:00Z', '2026-11-07T19:00:00Z') },
      { guideId: 'future', current: listing('Football later', '2026-11-07T18:30:01Z', '2026-11-07T19:00:00Z') },
      { guideId: 'expired', current: listing('Football finished', '2026-11-07T18:00:00Z', '2026-11-07T18:30:00Z') },
      { guideId: 'invalid', current: listing('Football invalid', 'unknown', 'unknown') },
    ],
  };
  it('matches only current titles at inclusive start/exclusive end, groups exact IDs and retains versions', () => {
    const results = programmeSearch(channels, data, '  FOOTball ', 'all', [], now);
    expect(results.map((group) => group.current.title)).toEqual(['Football live', 'Football separate']);
    expect(results[0].versions.map((channel) => channel.name)).toEqual(['Match HD', 'Match 4K']);
    expect(programmeSearch(channels, data, 'studio', 'all', [], now)).toEqual([]);
    expect(programmeSearch(channels, data, 'Match HD', 'all', [], now)).toEqual([]);
    expect(programmeSearch(channels, data, ' ', 'all', [], now)).toEqual([]);
    expect(programmeSearch(channels, {}, 'football', 'all', [], now)).toEqual([]);
  });
  it('scopes by visible Sports and exact favourite versions, keeping the full visible group in details', () => {
    expect(programmeSearch(channels, data, 'football', 'sports', [], now).map((group) => group.key)).toEqual([
      'guide:match',
      'guide:Match',
    ]);
    const saved = [channels[1]];
    const results = programmeSearch(channels, data, 'football', 'favourites', saved, now);
    expect(results).toHaveLength(1);
    expect(results[0].versions).toEqual(channels.slice(0, 2));
    expect(programmeSearch(channels.slice(2), data, 'football', 'favourites', saved, now)).toEqual([]);
  });
});
