import { describe, expect, it } from 'vitest';
import {
  buildCompletedCardDecisionReceipt,
  buildLimitedDropReadModel,
  LIMITED_DROP_EVENT_NAMES,
  LIMITED_DROP_FUNNEL_CONTRACT_VERSION,
  type LimitedDropEvent,
  limitedDropEventSchema,
  type StoredLimitedDropEvent,
} from './limited-drop-funnel';

const ARTIST_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const DROP_ID = '33333333-3333-4333-8333-333333333333';
const START = new Date('2026-09-01T00:00:00.000Z');
const END = new Date('2026-09-15T00:00:00.000Z');
let eventSequence = 0;

function uuid(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function eventFor(
  eventName: LimitedDropEvent['event_name'],
  overrides: Partial<StoredLimitedDropEvent> = {}
): StoredLimitedDropEvent {
  eventSequence += 1;
  const occurredAt = `2026-09-${String(1 + (eventSequence % 10)).padStart(2, '0')}T12:00:00.000Z`;
  const base: StoredLimitedDropEvent = {
    contract_version: LIMITED_DROP_FUNNEL_CONTRACT_VERSION,
    event_name: eventName,
    event_id: uuid(eventSequence),
    session_id: uuid(100_000 + eventSequence),
    artist_id: ARTIST_ID,
    asset_id: ASSET_ID,
    drop_id: DROP_ID,
    page_id: 'drop_page',
    state: 'countdown',
    card_placement: 'drop_primary',
    share_id: 'share_launch',
    campaign_id: 'campaign_fall',
    experiment_id: 'experiment_completed_card',
    variant_id: 'variant_treatment',
    item_mode: 'active_drop',
    channel: eventName === 'drop_marketing_consent_granted' ? 'email' : null,
    terminal_reason: eventName === 'drop_terminal_reached' ? 'sold_out' : null,
    occurred_at: occurredAt,
    ingested_at: occurredAt.replace('12:00', '12:01'),
  };
  return { ...base, ...overrides };
}

function completeFunnelFixture(): StoredLimitedDropEvent[] {
  const sessionId = uuid(900_001);
  const common = { session_id: sessionId } as const;
  return [
    eventFor('profile_card_impression', {
      ...common,
      page_id: 'profile_page',
      card_placement: 'profile_primary',
    }),
    eventFor('profile_card_clicked', {
      ...common,
      page_id: 'profile_page',
      card_placement: 'profile_primary',
    }),
    eventFor('asset_page_viewed', {
      ...common,
      page_id: 'asset_page',
      card_placement: 'asset_primary',
    }),
    eventFor('drop_countdown_viewed', common),
    eventFor('drop_capture_started', {
      ...common,
      state: 'capture',
    }),
    eventFor('drop_capture_submitted', {
      ...common,
      state: 'capture',
    }),
    eventFor('drop_marketing_consent_granted', {
      ...common,
      state: 'capture',
      channel: 'email',
    }),
    eventFor('drop_purchase_started', {
      ...common,
      state: 'purchase',
    }),
    eventFor('drop_purchase_completed', {
      ...common,
      state: 'purchase',
    }),
    eventFor('drop_terminal_reached', {
      ...common,
      page_id: 'terminal_page',
      state: 'sold_out',
      card_placement: 'terminal_page',
      item_mode: 'completed_drop',
      terminal_reason: 'sold_out',
    }),
    eventFor('completed_drop_card_exposure', {
      ...common,
      page_id: 'profile_page',
      state: 'completed_card',
      card_placement: 'completed_drop_profile',
      item_mode: 'completed_drop',
    }),
    eventFor('completed_drop_signup', {
      ...common,
      page_id: 'terminal_page',
      state: 'sold_out',
      card_placement: 'terminal_page',
      item_mode: 'completed_drop',
    }),
    eventFor('completed_drop_signup', {
      ...common,
      page_id: 'profile_page',
      state: 'completed_card',
      card_placement: 'completed_drop_profile',
      item_mode: 'completed_drop',
    }),
  ];
}

function armEvents(
  variantId: 'variant_control' | 'variant_treatment',
  completedSignups: number
): StoredLimitedDropEvent[] {
  const events: StoredLimitedDropEvent[] = [];
  for (let index = 0; index < 200; index += 1) {
    const sessionId = uuid(
      200_000 + index + (variantId === 'variant_control' ? 0 : 1_000)
    );
    const common = { session_id: sessionId, variant_id: variantId } as const;
    events.push(
      eventFor('profile_card_impression', {
        ...common,
        page_id: 'profile_page',
        card_placement: 'profile_primary',
      }),
      eventFor('asset_page_viewed', {
        ...common,
        page_id: 'asset_page',
        card_placement: 'asset_primary',
      }),
      eventFor('drop_terminal_reached', {
        ...common,
        page_id: 'terminal_page',
        state: 'sold_out',
        card_placement: 'terminal_page',
        item_mode: 'completed_drop',
        terminal_reason: 'sold_out',
      })
    );
    if (index < 100) {
      events.push(
        eventFor('drop_purchase_completed', {
          ...common,
          state: 'purchase',
        })
      );
    }
    if (index < 50) {
      events.push(
        eventFor('completed_drop_signup', {
          ...common,
          page_id: 'terminal_page',
          state: 'sold_out',
          card_placement: 'terminal_page',
          item_mode: 'completed_drop',
        })
      );
    }
    if (variantId === 'variant_treatment') {
      events.push(
        eventFor('completed_drop_card_exposure', {
          ...common,
          page_id: 'profile_page',
          state: 'completed_card',
          card_placement: 'completed_drop_profile',
          item_mode: 'completed_drop',
        })
      );
    }
    if (index < completedSignups) {
      events.push(
        eventFor('completed_drop_signup', {
          ...common,
          page_id: 'profile_page',
          state: 'completed_card',
          card_placement: 'completed_drop_profile',
          item_mode: 'completed_drop',
        })
      );
    }
  }
  return events;
}

describe('limited-drop event contract', () => {
  it('accepts exactly the canonical event names with stable shared properties', () => {
    expect(LIMITED_DROP_EVENT_NAMES).toEqual([
      'asset_page_viewed',
      'drop_countdown_viewed',
      'drop_capture_started',
      'drop_capture_submitted',
      'drop_marketing_consent_granted',
      'drop_purchase_started',
      'drop_purchase_completed',
      'drop_terminal_reached',
      'profile_card_impression',
      'profile_card_clicked',
      'completed_drop_card_exposure',
      'completed_drop_signup',
    ]);
    for (const eventName of LIMITED_DROP_EVENT_NAMES) {
      const candidate = eventFor(eventName, {
        ...(eventName === 'drop_terminal_reached'
          ? { state: 'sold_out' as const }
          : {}),
        ...(eventName === 'completed_drop_card_exposure'
          ? {
              page_id: 'profile_page' as const,
              card_placement: 'completed_drop_profile' as const,
            }
          : {}),
        ...(eventName === 'completed_drop_signup'
          ? { card_placement: 'terminal_page' as const }
          : {}),
      });
      const { ingested_at: _ingestedAt, ...payload } = candidate;
      expect(limitedDropEventSchema.safeParse(payload).success).toBe(true);
      expect(payload).toMatchObject({
        artist_id: ARTIST_ID,
        asset_id: ASSET_ID,
        drop_id: DROP_ID,
        page_id: expect.any(String),
        state: expect.any(String),
        card_placement: expect.any(String),
        share_id: 'share_launch',
        campaign_id: 'campaign_fall',
      });
    }
  });

  it('rejects extra or embedded raw contact data', () => {
    const valid = eventFor('asset_page_viewed');
    const { ingested_at: _ingestedAt, ...payload } = valid;
    expect(
      limitedDropEventSchema.safeParse({
        ...payload,
        email: 'fan@example.com',
      }).success
    ).toBe(false);
    expect(
      limitedDropEventSchema.safeParse({
        ...payload,
        campaign_id: 'fan@example.com',
      }).success
    ).toBe(false);
    expect(
      limitedDropEventSchema.safeParse({
        ...payload,
        share_id: '14155551212',
      }).success
    ).toBe(false);
  });

  it('requires event-specific consent and terminal fields', () => {
    const consent = eventFor('drop_marketing_consent_granted');
    const terminal = eventFor('drop_terminal_reached', { state: 'sold_out' });
    const { ingested_at: _consentIngested, ...consentPayload } = consent;
    const { ingested_at: _terminalIngested, ...terminalPayload } = terminal;
    expect(
      limitedDropEventSchema.safeParse({ ...consentPayload, channel: null })
        .success
    ).toBe(false);
    expect(
      limitedDropEventSchema.safeParse({
        ...terminalPayload,
        terminal_reason: null,
      }).success
    ).toBe(false);
  });
});

describe('limited-drop funnel read model', () => {
  it('produces a complete deduplicated receipt from profile impression through terminal signup', () => {
    const events = completeFunnelFixture();
    const normalSession = uuid(900_002);
    const normalView = eventFor('asset_page_viewed', {
      session_id: normalSession,
      drop_id: null,
      item_mode: 'normal',
      state: 'normal_item',
      page_id: 'asset_page',
      card_placement: 'asset_primary',
    });
    events.push(
      normalView,
      { ...normalView },
      eventFor('drop_purchase_completed', {
        session_id: normalSession,
        drop_id: null,
        item_mode: 'normal',
        state: 'purchase',
      })
    );

    const receipt = buildLimitedDropReadModel(events, {
      start: START,
      end: END,
      observedAt: END,
      artistId: ARTIST_ID,
    });

    expect(receipt.contract_version).toBe('limited-drop-funnel/v1');
    expect(receipt.event_counts).toMatchObject({
      profile_card_impression: 1,
      profile_card_clicked: 1,
      asset_page_viewed: 2,
      drop_countdown_viewed: 1,
      drop_capture_started: 1,
      drop_capture_submitted: 1,
      drop_marketing_consent_granted: 1,
      drop_purchase_started: 1,
      drop_purchase_completed: 2,
      drop_terminal_reached: 1,
      completed_drop_card_exposure: 1,
      completed_drop_signup: 2,
    });
    expect(receipt.quality.duplicate_events_dropped).toBe(1);
    expect(receipt.freshness.status).toBe('fresh');
    expect(receipt.metrics.normal_item_purchase_rate).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate_percent: 100,
      availability: 'measured',
    });
    expect(receipt.metrics.active_drop_purchase_rate.rate_percent).toBe(100);
    expect(receipt.metrics.terminal_page_signup_rate.rate_percent).toBe(100);
    expect(receipt.metrics.completed_card_signup_rate.rate_percent).toBe(100);
  });

  it('marks an absent denominator unknown instead of fabricating a zero baseline', () => {
    const receipt = buildLimitedDropReadModel([], {
      start: START,
      end: END,
      observedAt: END,
    });
    expect(receipt.metrics.active_drop_purchase_rate).toMatchObject({
      numerator: 0,
      denominator: 0,
      rate_percent: null,
      availability: 'unknown',
    });
    expect(receipt.freshness.status).toBe('unknown');
  });
});

describe('completed-card decision receipt', () => {
  it('records keep, hide, iterate, and inconclusive outcomes at the approved window', () => {
    const control = buildLimitedDropReadModel(armEvents('variant_control', 0), {
      start: START,
      end: END,
      observedAt: END,
      artistId: ARTIST_ID,
      variantId: 'variant_control',
    });
    const treatment = buildLimitedDropReadModel(
      armEvents('variant_treatment', 20),
      {
        start: START,
        end: END,
        observedAt: END,
        artistId: ARTIST_ID,
        variantId: 'variant_treatment',
      }
    );
    const decisionInput = {
      experimentId: 'experiment_completed_card',
      approvedWindow: { start: START, end: END },
      recordedAt: END,
      control,
      treatment,
      privacyIncidents: 0,
    } as const;

    const keep = buildCompletedCardDecisionReceipt(decisionInput);
    expect(keep).toMatchObject({
      contract_version: 'completed-drop-card-decision/v1',
      recorded_at: END.toISOString(),
      decision: 'keep',
      minimum_exposure: { required: 200, control: 200, treatment: 200 },
      ship_now: 'keep the completed-drop profile card visible',
    });
    expect(
      buildCompletedCardDecisionReceipt({
        ...decisionInput,
        privacyIncidents: 1,
      }).decision
    ).toBe('hide');
    expect(
      buildCompletedCardDecisionReceipt({
        ...decisionInput,
        treatment: control,
      }).decision
    ).toBe('iterate');

    const immature = buildLimitedDropReadModel(completeFunnelFixture(), {
      start: START,
      end: END,
      observedAt: END,
      artistId: ARTIST_ID,
    });
    const inconclusive = buildCompletedCardDecisionReceipt({
      ...decisionInput,
      control: immature,
      treatment: immature,
    });
    expect(inconclusive.decision).toBe('inconclusive');
    expect(inconclusive.reasons).toContain('minimum_exposure_not_reached');
    expect(inconclusive.re_evaluate_when).toBe(
      'the listed evidence gaps are resolved'
    );
  });
});
