import { describe, expect, it } from 'vitest';
import { pickOneRightThing } from './engine';
import { featuredEventExtras } from './event-extras';
import { neutralVisitorSignals } from './visitor-signals';

describe('featuredEventExtras', () => {
  it('returns kind, reason and channel, omitting a null source', () => {
    const decision = pickOneRightThing({
      signals: neutralVisitorSignals(new Date('2026-10-25T00:00:00Z')),
      inventory: {
        release: null,
        shows: [],
        hasMerch: true,
        hasTip: false,
        hasListen: false,
      },
    });
    expect(featuredEventExtras(decision)).toEqual({
      featured_kind: 'merch',
      featured_reason: 'default_merch',
      featured_channel: 'direct',
    });
  });

  it('includes the source when known and nothing when there is no decision', () => {
    const decision = pickOneRightThing({
      signals: {
        ...neutralVisitorSignals(new Date('2026-10-25T00:00:00Z')),
        source: { channel: 'dsp', name: 'spotify' },
      },
      inventory: {
        release: {
          slug: 's',
          releaseDate: '2026-10-20T00:00:00Z',
          isUpcoming: false,
        },
        shows: [],
        hasMerch: false,
        hasTip: false,
        hasListen: true,
      },
    });
    expect(featuredEventExtras(decision)).toMatchObject({
      featured_reason: 'came_from_dsp_release',
      featured_source: 'spotify',
    });
    expect(featuredEventExtras(null)).toBeUndefined();
  });
});
