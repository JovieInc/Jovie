import { describe, expect, it } from 'vitest';
import {
  buildOpportunityInboxData,
  mapSuggestedActionToInboxCard,
} from './opportunity-inbox-mapper';

describe('mapSuggestedActionToInboxCard', () => {
  it('maps calendar suggestions with rationale and action labels', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-1',
      kind: 'calendar.create_event',
      payload: {
        title: 'Detroit listeners up 340% — book a show',
        rationale: 'Promoter email matched your Detroit growth spike.',
      },
      rationale: 'Promoter email matched your Detroit growth spike.',
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
    });

    expect(card).toMatchObject({
      id: 'action-1',
      typeLabel: 'Suggestion',
      title: 'Detroit listeners up 340% — book a show',
      why: 'Promoter email matched your Detroit growth spike.',
      primaryActionLabel: 'Add to calendar',
      status: 'pending',
    });
  });

  it('falls back when payload title and rationale are missing', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-2',
      kind: 'unknown.kind',
      payload: {},
      rationale: null,
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
    });

    expect(card.title).toBe('Untitled suggestion');
    expect(card.why).toBe('Jovie found a booking signal worth your review.');
    expect(card.primaryActionLabel).toBe('Approve');
  });
});

describe('buildOpportunityInboxData', () => {
  it('includes default empty-state action cards', () => {
    const data = buildOpportunityInboxData([]);

    expect(data.cards).toEqual([]);
    expect(data.emptyActionCards).toHaveLength(2);
    expect(data.emptyActionCards[0]?.id).toBe('connect-spotify');
  });
});
