import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      throw new Error('no db in unit tests');
    },
  },
}));
vi.mock('@/lib/spotify', () => ({
  getSpotifyArtist: vi.fn(),
  buildSpotifyArtistUrl: (id: string) =>
    `https://open.spotify.com/artist/${id}`,
}));

import { confirmSelectedArtist } from '@/lib/chat/onboarding-script/engine';
import { routeOnboardingTurn } from '@/lib/chat/onboarding-script/route';
import { SCRIPT_LINES } from '@/lib/chat/onboarding-script/script';
import { ONBOARDING_WIDGET_EVENTS } from '@/lib/chat/onboarding-script/widget-events';
import { createOnboardingTurnState } from '@/lib/chat/tools/onboarding-tool-impls';
import { lintVoice } from '@/lib/chat/voice-lint';
import { getSpotifyArtist } from '@/lib/spotify';

const SESSION = '00112233-4455-6677-8899-aabbccddeeff';

function user(text: string, metadata?: Record<string, unknown>): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text }],
    ...(metadata ? { metadata } : {}),
  } as UIMessage;
}

function assistant(text: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

function stateFor(messages: readonly UIMessage[]) {
  return createOnboardingTurnState({
    sessionId: SESSION,
    turnCount: messages.filter(m => m.role === 'user').length,
    accessControlled: false,
    messages,
  });
}

async function route(messages: readonly UIMessage[]) {
  return routeOnboardingTurn({
    uiMessages: messages,
    state: stateFor(messages),
    artistConfirmation: null,
  });
}

describe('routeOnboardingTurn', () => {
  it('opens the picker prefilled when the first message is an artist name', async () => {
    const routed = await route([user('Tame Impala')]);
    expect(routed.kind).toBe('script');
    if (routed.kind !== 'script') return;
    expect(routed.turn.line.stepId).toBe('get_artist');
    expect(routed.turn.toolEvents[0]?.output.query).toBe('Tame Impala');
  });

  it('greets on a bare hello', async () => {
    const routed = await route([user('hey')]);
    expect(routed.kind === 'script' && routed.turn.line.stepId).toBe('greet');
  });

  it('answers a price question from the answer set and keeps the picker', async () => {
    const routed = await route([user('how much does this cost?')]);
    expect(routed.kind).toBe('script');
    if (routed.kind !== 'script') return;
    expect(routed.turn.line.stepId).toBe('faq_price');
    expect(routed.turn.toolEvents[0]?.output.action).toBe('open_artist_picker');
  });

  it('clarifies deterministically the first time it cannot read a message', async () => {
    const routed = await route([
      user(
        'I have been making music for a long time and need help sorting out where everything should live'
      ),
    ]);
    expect(routed.kind).toBe('script');
    if (routed.kind !== 'script') return;
    expect(routed.turn.line.stepId).toBe('clarify');
  });

  it('reaches the LLM only after a second unclear message', async () => {
    const unclear =
      'I have been making music for a long time and need help sorting out where everything should live';
    const first = await route([user(unclear)]);
    if (first.kind !== 'script') throw new Error('expected script');
    const routed = await route([
      user(unclear),
      assistant(first.turn.text),
      user(
        'no really, it is complicated and I cannot explain it in a few words here'
      ),
    ]);
    expect(routed.kind).toBe('llm');
  });

  it('routes widget events through the rail without classifying', async () => {
    const routed = await route([
      user('Tame Impala'),
      user('none', {
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.ARTIST_NONE_OF_THESE,
      }),
    ]);
    expect(routed.kind).toBe('script');
    if (routed.kind !== 'script') return;
    expect(routed.classification).toBeNull();
    expect(routed.turn.line.stepId).toBe('get_artist');
  });

  it('meets the server-side latency budget with no model on the path', async () => {
    const durations: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      const started = performance.now();
      await route([user(i % 2 ? 'Tame Impala' : 'what is jovie?')]);
      durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] as number;
    expect(p95).toBeLessThan(50);
  });
});

describe('system-1 answer sets', () => {
  const lines = SCRIPT_LINES.filter(
    line => line.stepId === 'clarify' || line.stepId.startsWith('faq_')
  );

  it('ships an answer for every intent', () => {
    expect(new Set(lines.map(line => line.stepId))).toEqual(
      new Set([
        'clarify',
        'faq_what',
        'faq_price',
        'faq_time',
        'faq_ownership',
        'faq_spotify',
      ])
    );
  });

  it.each(lines.map(line => [line.key, line.text]))(
    '%s passes the voice lint',
    (_key, text) => {
      expect(lintVoice(text as string).violations).toEqual([]);
    }
  );
});

// JOV-10168: the picker-selection turn renders "Confirm the handle below"
// but shipped no checkHandle card, so the visitor faced the prompt with no
// confirm control until they typed a reply (2026-10-31 signed-out replay).
describe('picker-selection turn (JOV-10168)', () => {
  it('ships the handle confirm card in the same turn as the confirm line', async () => {
    const PICKED = '4Uwpa6zW3zzCSQvooQNksm';
    vi.mocked(getSpotifyArtist).mockResolvedValue({
      id: PICKED,
      name: 'Greek',
      images: [],
      genres: [],
      popularity: 12,
      followers: { total: 4_321 },
    });
    const messages = [
      user('Tame Impala'),
      user('Selected: Greek', { spotifyArtistId: PICKED }),
    ];
    const state = stateFor(messages);
    const confirmation = await confirmSelectedArtist(messages, state);
    expect(confirmation).not.toBeNull();

    const routed = await routeOnboardingTurn({
      uiMessages: messages,
      state,
      artistConfirmation: confirmation,
    });
    expect(routed.kind).toBe('script');
    if (routed.kind !== 'script') return;
    expect(routed.turn.text).toContain('Confirm the handle');
    const check = routed.turn.toolEvents.find(
      event => event.toolName === 'checkHandle'
    );
    expect(check?.output).toMatchObject({
      action: 'check_handle',
      handle: 'greek',
    });
  });
});
