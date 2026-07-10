import { describe, expect, it } from 'vitest';
import {
  aggregateInboxDecisions,
  buildTastePreferencePages,
  formatTastePreferencePage,
} from './inbox-taste-mirror';

describe('inbox taste mirror (JOV-3934)', () => {
  it('aggregates decisions by card kind', () => {
    const aggregates = aggregateInboxDecisions([
      { verdict: 'approved', cardKind: 'youtube.thumbnail_experiment' },
      { verdict: 'approved', cardKind: 'youtube.thumbnail_experiment' },
      {
        verdict: 'rejected',
        cardKind: 'youtube.thumbnail_experiment',
        reason: 'not relevant',
      },
      { verdict: 'rejected', cardKind: 'calendar.create_event' },
    ]);

    expect(aggregates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardKind: 'youtube.thumbnail_experiment',
          approved: 2,
          rejected: 1,
          reasons: ['not relevant'],
        }),
        expect.objectContaining({
          cardKind: 'calendar.create_event',
          approved: 0,
          rejected: 1,
        }),
      ])
    );
  });

  it('builds gbrain-ready taste preference pages sorted by net score', () => {
    const pages = buildTastePreferencePages([
      {
        cardKind: 'youtube.thumbnail_experiment',
        approved: 5,
        rejected: 1,
        reasons: [],
      },
      {
        cardKind: 'calendar.create_event',
        approved: 0,
        rejected: 3,
        reasons: ['wrong venue'],
      },
    ]);

    expect(pages[0]?.slug).toContain('youtube');
    expect(pages[0]?.netScore).toBe(4);
    expect(pages[1]?.netScore).toBe(-3);

    const body = formatTastePreferencePage(pages[0]!);
    expect(body).toContain('approved: 5');
    expect(body).toContain('# Inbox taste: youtube.thumbnail_experiment');
  });
});
