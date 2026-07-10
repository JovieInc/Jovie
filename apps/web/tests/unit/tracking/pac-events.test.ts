import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTrack, mockPostJsonBeacon, mockGetConsentState } = vi.hoisted(
  () => ({
    mockTrack: vi.fn(),
    mockPostJsonBeacon: vi.fn(),
    mockGetConsentState: vi.fn(() => 'undecided'),
  })
);

vi.mock('@/lib/analytics', () => ({
  track: mockTrack,
}));

vi.mock('@/lib/tracking/json-beacon', () => ({
  postJsonBeacon: mockPostJsonBeacon,
}));

vi.mock('@/lib/tracking/consent', () => ({
  getConsentState: mockGetConsentState,
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_E2E_MODE: undefined },
}));

import {
  createPacPlayMilestoneTracker,
  getPacSessionId,
  trackPacClientEvent,
  trackPacExposure,
} from '@/lib/tracking/pac-events';
import {
  buildPacVariantId,
  PAC_CLIENT_EVENTS,
  PAC_EVENT_ENDPOINT,
  PAC_SERVER_EVENTS,
  PAC_STATES,
  type PacClientEventName,
  pacEventBeaconSchema,
} from '@/lib/tracking/pac-events-contract';

const PROFILE_ID = '3f9c2f6a-8f1e-4b6a-9a44-1c2d3e4f5a6b';

const CONTEXT = {
  profileId: PROFILE_ID,
  variantId: 'copy:default|trigger:30s|s2:merch|tab:visible|dismiss:text',
  pacState: 'idle',
} as const;

describe('PAC event schema (spec §8)', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear();
    mockTrack.mockClear();
    mockPostJsonBeacon.mockClear();
    mockGetConsentState.mockReturnValue('undecided');
  });

  it('defines 11 client events + the server back-join event', () => {
    expect(PAC_CLIENT_EVENTS).toEqual([
      'pac_exposure',
      'pac_play_start',
      'pac_play_30s',
      'pac_play_complete',
      'capture_prompt_shown',
      'capture_submit',
      'capture_success',
      'capture_error',
      'capture_dismiss',
      'capture_channel_toggle',
      'pac_secondary_click',
    ]);
    expect(PAC_SERVER_EVENTS).toEqual(['pac_s2_convert']);
  });

  it('builds the combined variant key from all five assignment slots', () => {
    expect(
      buildPacVariantId({
        copyArm: 'alternate',
        triggerThreshold: 'track_complete',
        s2Slot: 'tip',
        tabBar: 'hidden',
        dismissAffordance: 'icon',
      })
    ).toBe(
      'copy:alternate|trigger:track_complete|s2:tip|tab:hidden|dismiss:icon'
    );
  });

  it('emits every client event with the full payload contract', () => {
    for (const event of PAC_CLIENT_EVENTS) {
      const payload = trackPacClientEvent(event, CONTEXT);

      expect(payload).toMatchObject({
        event,
        jv_aid: null,
        profile_id: PROFILE_ID,
        pac_state: 'idle',
        variant_id: CONTEXT.variantId,
        consent: 'undecided',
      });
      expect(payload?.session_id).toBeTruthy();
      expect(typeof payload?.ts).toBe('number');

      expect(mockTrack).toHaveBeenLastCalledWith(
        event,
        expect.objectContaining({
          profile_id: PROFILE_ID,
          pac_state: 'idle',
          variant_id: CONTEXT.variantId,
        })
      );
      expect(mockPostJsonBeacon).toHaveBeenLastCalledWith(
        PAC_EVENT_ENDPOINT,
        payload
      );
    }

    expect(mockTrack).toHaveBeenCalledTimes(PAC_CLIENT_EVENTS.length);
    expect(mockPostJsonBeacon).toHaveBeenCalledTimes(PAC_CLIENT_EVENTS.length);
  });

  it('shares one session_id across events within a session', () => {
    const first = trackPacClientEvent('pac_play_start', {
      ...CONTEXT,
      pacState: 'playing',
    });
    const second = trackPacClientEvent('capture_prompt_shown', {
      ...CONTEXT,
      pacState: 'prompt',
    });

    expect(first?.session_id).toBe(getPacSessionId());
    expect(second?.session_id).toBe(first?.session_id);
  });

  it('carries the current consent state on every payload', () => {
    mockGetConsentState.mockReturnValue('gpc-opted-out');

    const payload = trackPacClientEvent('capture_submit', {
      ...CONTEXT,
      pacState: 'submitting',
    });

    expect(payload?.consent).toBe('gpc-opted-out');
  });

  it('attaches structured extras (capture_error rule, channel, slot)', () => {
    const errorPayload = trackPacClientEvent(
      'capture_error',
      { ...CONTEXT, pacState: 'error' },
      { rule: 'invalid_email' }
    );
    expect(errorPayload?.extras).toEqual({ rule: 'invalid_email' });

    const togglePayload = trackPacClientEvent(
      'capture_channel_toggle',
      { ...CONTEXT, pacState: 'prompt' },
      { channel: 'sms' }
    );
    expect(togglePayload?.extras).toEqual({ channel: 'sms' });

    const clickPayload = trackPacClientEvent(
      'pac_secondary_click',
      { ...CONTEXT, pacState: 'merch' },
      { slot: 'merch' }
    );
    expect(clickPayload?.extras).toEqual({ slot: 'merch' });
  });

  it('fires pac_exposure once per state per session', () => {
    expect(trackPacExposure(CONTEXT)).not.toBeNull();
    expect(trackPacExposure(CONTEXT)).toBeNull();
    expect(mockPostJsonBeacon).toHaveBeenCalledTimes(1);

    // A different PAC state is a fresh exposure.
    expect(trackPacExposure({ ...CONTEXT, pacState: 'prompt' })).not.toBeNull();
    expect(mockPostJsonBeacon).toHaveBeenCalledTimes(2);

    // A different profile is a fresh exposure too.
    expect(
      trackPacExposure({
        ...CONTEXT,
        profileId: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
      })
    ).not.toBeNull();
    expect(mockPostJsonBeacon).toHaveBeenCalledTimes(3);
  });

  it('emitted payloads validate against the sink schema', () => {
    const payload = trackPacClientEvent(
      'capture_success',
      { ...CONTEXT, pacState: 'success' },
      { channel: 'email' }
    );

    const parsed = pacEventBeaconSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('sink schema rejects unknown events and states', () => {
    const payload = trackPacClientEvent('capture_success', {
      ...CONTEXT,
      pacState: 'success',
    });

    expect(
      pacEventBeaconSchema.safeParse({ ...payload, event: 'pac_s2_convert' })
        .success
    ).toBe(false);
    expect(
      pacEventBeaconSchema.safeParse({ ...payload, event: 'made_up' }).success
    ).toBe(false);
    expect(
      pacEventBeaconSchema.safeParse({ ...payload, pac_state: 'unknown' })
        .success
    ).toBe(false);
  });

  it('covers all twelve PAC states in the contract', () => {
    expect(PAC_STATES).toHaveLength(12);
  });
});

describe('createPacPlayMilestoneTracker', () => {
  it('fires start once, 30s at cumulative playback, and complete once', () => {
    let now = 0;
    const events: Array<{ event: PacClientEventName; extras?: unknown }> = [];
    const tracker = createPacPlayMilestoneTracker(
      (event, extras) => events.push({ event, extras }),
      () => now
    );

    tracker.onPlay();
    tracker.onPlay(); // duplicate play must not re-fire start
    expect(events.map(e => e.event)).toEqual(['pac_play_start']);

    // 20s of playback, then a pause — below the milestone.
    now = 20_000;
    tracker.onPause();
    expect(events.map(e => e.event)).toEqual(['pac_play_start']);

    // Resume; cumulative playback crosses 30s at now=35s (20s + 15s).
    tracker.onPlay();
    now = 30_000;
    tracker.onTick();
    expect(events.map(e => e.event)).toEqual(['pac_play_start']);

    now = 35_000;
    tracker.onTick();
    expect(events.map(e => e.event)).toEqual([
      'pac_play_start',
      'pac_play_30s',
    ]);

    now = 40_000;
    tracker.onComplete();
    tracker.onComplete(); // duplicate complete must not re-fire
    expect(events.map(e => e.event)).toEqual([
      'pac_play_start',
      'pac_play_30s',
      'pac_play_complete',
    ]);
  });

  it('fires the 30s milestone on complete when it was never ticked', () => {
    let now = 0;
    const events: string[] = [];
    const tracker = createPacPlayMilestoneTracker(
      event => events.push(event),
      () => now
    );

    tracker.onPlay();
    now = 45_000;
    tracker.onComplete();

    expect(events).toEqual([
      'pac_play_start',
      'pac_play_30s',
      'pac_play_complete',
    ]);
  });
});
