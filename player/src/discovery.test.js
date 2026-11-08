import { describe, it, expect } from 'vitest';
import { discoveryGroups, preferredVersion, guideProgress } from './logic.js';

const now = Date.parse('2026-11-07T18:30:00Z');
const live = { title: 'Match', start: '2026-11-07T18:00:00Z', end: '2026-11-07T19:00:00Z' };
const channels = [
  { name: 'Unknown HD', url: 'https://provider/unknown', guideId: '', group: 'Sports' },
  { name: 'Sport HD English', url: 'https://provider/sport?quality=hd&lang=en', guideId: 'sport', group: 'Sports' },
  { name: 'Sport 4K Polish', url: 'https://provider/sport?quality=4k&lang=pl', guideId: 'sport', group: 'Sports' },
  { name: 'Sport lookalike', url: 'https://provider/other', guideId: 'Sport', group: 'News' },
  { name: 'Unknown 4K', url: 'https://provider/unknown4k', guideId: '', group: 'Sports' },
];
describe('current discovery scope and exact versions', () => {
  it('groups exact nonempty IDs, puts each unknown stream below known programmes, and expires at end', () => {
    const data = { channels: [{ guideId: 'sport', current: live }] };
    const groups = discoveryGroups(channels, data, 'all', [], now);
    expect(groups.map((g) => g.versions.map((c) => c.name))).toEqual([
      ['Sport HD English', 'Sport 4K Polish'],
      ['Unknown HD'],
      ['Sport lookalike'],
      ['Unknown 4K'],
    ]);
    expect(groups[0].current).toEqual(live);
    expect(discoveryGroups(channels, data, 'all', [], Date.parse(live.end)).every((g) => !g.current)).toBe(true);
  });
  it('filters eligible cards while details retain visible versions and honours ordered exact favourites', () => {
    const data = { channels: [{ guideId: 'sport', current: live }] };
    const favourites = [channels[2], channels[1]];
    const groups = discoveryGroups(channels, data, 'favourites', favourites, now);
    expect(groups).toHaveLength(1);
    expect(groups[0].versions).toEqual([channels[1], channels[2]]);
    expect(preferredVersion(groups[0].versions, favourites, channels[1].url)).toBe(1);
    expect(preferredVersion(groups[0].versions, [], channels[2].url + '&token=rotated')).toBe(1);
    expect(preferredVersion(groups[0].versions, [], 'https://provider/missing')).toBe(0);
    expect(discoveryGroups(channels, data, 'sports', [], now)).toHaveLength(3);
    expect(guideProgress(live, now)).toBe(50);
    expect(guideProgress(live, Date.parse(live.end))).toBe(100);
    expect(guideProgress({ start: live.end, end: live.start }, now)).toBe(0);
  });
});
