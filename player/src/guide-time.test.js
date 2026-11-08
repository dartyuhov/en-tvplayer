import { describe, expect, it } from 'vitest';
import process from 'node:process';
import { guideDayRange, guideIsCurrent, guideState } from './logic.js';

describe('guide instants and freshness', () => {
  it('uses a half-open current interval and ages cached responses locally', () => {
    const programme = { start: '2026-11-07T23:30:00Z', end: '2026-11-08T00:30:00Z' };
    expect(guideIsCurrent(programme, Date.parse('2026-11-08T00:29:59Z'))).toBe(true);
    expect(guideIsCurrent(programme, Date.parse('2026-11-08T00:30:00Z'))).toBe(false);
    expect(guideState({ updatedAt: '2026-11-07T22:00:00Z' }, Date.parse('2026-11-08T00:00:01Z'))).toBe('Guide stale');
    expect(guideState({ status: 'no_matching_id' })).toBe('No matching guide ID');
    expect(guideState({ status: 'offline' })).toContain('Guide offline');
  });
  it('uses local calendar midnights across daylight-saving changes', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Europe/Madrid';
    try {
      expect(guideDayRange(new Date('2026-10-25T12:00:00Z'))).toEqual({
        from: '2026-10-24T22:00:00.000Z',
        to: '2026-10-25T23:00:00.000Z',
      });
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
