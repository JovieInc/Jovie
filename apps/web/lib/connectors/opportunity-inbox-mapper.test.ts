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
      signalType: 'new_event',
      typeLabel: 'New Event',
      title: 'Detroit listeners up 340% — book a show',
      why: 'Promoter email matched your Detroit growth spike.',
      primaryActionLabel: 'Add to calendar',
      status: 'pending',
    });
  });

  it('uses the persisted signal_type when present', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-3',
      kind: 'unknown.kind',
      payload: { title: 'Fresh drop' },
      rationale: null,
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
      signalType: 'new_song',
    });

    expect(card.signalType).toBe('new_song');
    expect(card.typeLabel).toBe('New Song');
  });

  it('maps authority.create_page with draft CTA and profile-match type', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-authority-1',
      kind: 'authority.create_page',
      payload: {
        title: 'Create Fandom (EDM Wiki) page for Tim White',
        primaryActionLabel: 'Draft page',
      },
      rationale:
        'Peers mention you on Fandom without a link because no artist page exists yet. Example: unlinked mention on Cosmic Gate.',
      createdAt: new Date('2026-07-21T10:00:00.000Z'),
    });

    expect(card).toMatchObject({
      id: 'action-authority-1',
      signalType: 'new_profile_match',
      typeLabel: 'Profile Match',
      title: 'Create Fandom (EDM Wiki) page for Tim White',
      primaryActionLabel: 'Draft page',
      status: 'pending',
      category: 'suggestion',
    });
    expect(card.why).toContain('Cosmic Gate');
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
    expect(card.signalType).toBe('other');
    expect(card.typeLabel).toBe('Suggestion');
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

describe('tour-date classification in the mapper', () => {
  it('classifies tour-date-looking calendar signals with tour category + event type', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-3',
      kind: 'calendar.create_event',
      payload: {
        title: 'Show at Saint Andrews Hall',
        venueName: 'Saint Andrews Hall',
        city: 'Detroit',
      },
      rationale: 'Promoter email proposed a Detroit tour stop.',
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
    });

    // category drives tour-date action labels; signalType drives the typed chip.
    expect(card.category).toBe('tour_date');
    expect(card.signalType).toBe('new_event');
    expect(card.typeLabel).toBe('New Event');
    expect(card.primaryActionLabel).toBe('Confirm date');
  });

  it('keeps non-tour calendar signals as suggestions with event type', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-4',
      kind: 'calendar.create_event',
      payload: { title: 'Weekly catalog review' },
      rationale: 'Recurring planning block.',
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
    });

    expect(card.category).toBe('suggestion');
    expect(card.signalType).toBe('new_event');
    expect(card.typeLabel).toBe('New Event');
    expect(card.primaryActionLabel).toBe('Add to calendar');
  });
});

describe('buildOpportunityInboxData tour-date sections', () => {
  it('passes tour-date sections through when provided', () => {
    const tourDates = {
      pending: [
        {
          id: 'td-1',
          title: 'Saint Andrews Hall',
          startDate: '2026-08-14T00:00:00.000Z',
          startTime: null,
          venueName: 'Saint Andrews Hall',
          location: 'Detroit, MI',
          providerLabel: 'Bandsintown',
          status: 'pending' as const,
        },
      ],
      confirmed: [],
      rejected: [],
    };

    const data = buildOpportunityInboxData([], tourDates);
    expect(data.tourDates).toEqual(tourDates);
  });

  it('omits tour-date sections when not provided', () => {
    const data = buildOpportunityInboxData([]);
    expect(data.tourDates).toBeUndefined();
  });
});
