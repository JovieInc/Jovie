import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSpotifyArtistMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
// No DB in unit tests — loadScriptBank degrades to code seeds.
vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      throw new Error('no db in unit tests');
    },
  },
}));
vi.mock('@/lib/spotify', () => ({
  getSpotifyArtist: hoisted.getSpotifyArtistMock,
  buildSpotifyArtistUrl: (id: string) =>
    `https://open.spotify.com/artist/${id}`,
}));

import {
  decideFallbackTurn,
  handleFromArtistName,
  parseArtistSelection,
  parseAudienceBand,
  resolveGuardedStep,
} from '@/lib/chat/onboarding-script/engine';
import { ONBOARDING_WIDGET_EVENTS } from '@/lib/chat/onboarding-script/widget-events';
import { createOnboardingTurnState } from '@/lib/chat/tools/onboarding-tool-impls';

const SESSION = '00112233-4455-6677-8899-aabbccddeeff';

function user(text: string, metadata?: Record<string, unknown>): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text }],
    ...(metadata ? { metadata } : {}),
  } as UIMessage;
}

function assistant(
  text: string,
  toolParts: readonly {
    toolName: string;
    output: Record<string, unknown>;
  }[] = []
): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [
      { type: 'text', text },
      ...toolParts.map(part => ({
        type: `tool-${part.toolName}`,
        toolCallId: crypto.randomUUID(),
        state: 'output-available',
        input: {},
        output: part.output,
      })),
    ],
  } as UIMessage;
}

function stateFor(messages: readonly UIMessage[]) {
  return createOnboardingTurnState({
    sessionId: SESSION,
    turnCount: messages.filter(m => m.role === 'user').length,
    messages,
  });
}

async function decide(messages: readonly UIMessage[]) {
  return decideFallbackTurn({
    uiMessages: messages,
    state: stateFor(messages),
  });
}

const CONFIRMED_OUTPUT = {
  action: 'spotify_artist_confirmed',
  spotifyArtistId: 'artist-1',
  artist: {
    id: 'artist-1',
    name: 'Test Artist',
    url: 'https://open.spotify.com/artist/artist-1',
    followers: 12_300,
    popularity: 48,
    genres: ['house'],
  },
};

const HANDLE_CHECKED = {
  toolName: 'checkHandle',
  output: { action: 'check_handle', handle: 'testartist' },
} as const;

const HANDLE_CONFIRMED = {
  toolName: 'checkHandle',
  output: {
    action: 'handle_confirmed',
    handle: 'testartist',
    summary: 'Handle @testartist confirmed.',
  },
} as const;

const SOCIAL_PROPOSED = {
  toolName: 'proposeSocialLink',
  output: {
    action: 'propose_social_link',
    url: null,
    summary: 'Attach a public social account.',
  },
} as const;

const SOCIAL_ATTACHED = {
  toolName: 'proposeSocialLink',
  output: {
    action: 'social_attached',
    url: 'https://instagram.com/testartist',
    summary: 'Attached https://instagram.com/testartist.',
  },
} as const;

function baseThroughArtist() {
  return [
    user('hey'),
    assistant('Pulled you up.', [
      { toolName: 'confirmSpotifyArtist', output: CONFIRMED_OUTPUT },
    ]),
  ] as const;
}

describe('parseArtistSelection', () => {
  it('reads the spotifyArtistId from message metadata', () => {
    expect(
      parseArtistSelection(user('I picked X', { spotifyArtistId: 'abc123' }))
    ).toBe('abc123');
  });

  it('parses a pasted Spotify artist URL', () => {
    expect(
      parseArtistSelection(
        user('here https://open.spotify.com/artist/4uXYZ?si=1')
      )
    ).toBe('4uXYZ');
  });

  it('returns null for plain text', () => {
    expect(parseArtistSelection(user('I am Test Artist'))).toBeNull();
  });
});

describe('parseAudienceBand', () => {
  it.each([
    ['about 200 people', 'under_500'],
    ['2k monthly', '500_to_5k'],
    ['12,000 followers', '5k_to_50k'],
    ['around 100k', '50k_to_500k'],
    ['1.2m', 'over_500k'],
    ['no idea honestly', null],
  ])('%s → %s', (text, band) => {
    expect(parseAudienceBand(text)).toBe(band);
  });
});

describe('handleFromArtistName', () => {
  it('slugs names to handle-safe strings', () => {
    expect(handleFromArtistName('Tïesto & Friends!')).toBe('tiestofriends');
    expect(handleFromArtistName('')).toBe('artist');
  });
});

describe('decideFallbackTurn', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('greets on the first turn with early-access disclosure', async () => {
    const turn = await decide([user('hey')]);
    expect(turn.line.stepId).toBe('greet');
    expect(turn.toolEvents).toHaveLength(0);
    expect(turn.text).toContain("I'm Jovie");
    expect(turn.text.toLowerCase()).toMatch(/early access|waitlist/);
    expect(turn.guardedStep).toBe('role');
  });

  it('opens the artist picker on later turns without an artist', async () => {
    const turn = await decide([
      user('hey'),
      assistant('What are you working on?'),
      user('I am Test Artist'),
    ]);
    expect(turn.line.stepId).toBe('get_artist');
    expect(turn.toolEvents).toHaveLength(1);
    expect(turn.toolEvents[0]?.toolName).toBe('searchSpotifyArtist');
    expect(turn.toolEvents[0]?.output.action).toBe('open_artist_picker');
    expect(turn.toolEvents[0]?.input.query).toBe('I am Test Artist');
    expect(turn.guardedStep).toBe('artist_search');
  });

  it('prefills empty query when prior message is incomplete ack', async () => {
    const turn = await decide([
      user('hey'),
      assistant('What are you working on?'),
      user('k'),
    ]);
    expect(turn.toolEvents[0]?.input.query).toBe('');
    expect(turn.toolEvents[0]?.output.query).toBeNull();
  });

  it('confirms the artist when the user picks one (metadata id)', async () => {
    hoisted.getSpotifyArtistMock.mockResolvedValue({
      id: 'artist-1',
      name: 'Test Artist',
      images: [{ url: 'https://i.scdn.co/image/x' }],
      genres: ['house'],
      popularity: 48,
      followers: { total: 12_300 },
    });
    const turn = await decide([
      user('hey'),
      assistant('Pick your artist below.', [
        {
          toolName: 'searchSpotifyArtist',
          output: { action: 'open_artist_picker', query: 'test' },
        },
      ]),
      user('I picked Test Artist on Spotify.', { spotifyArtistId: 'artist-1' }),
    ]);
    expect(turn.line.stepId).toBe('confirm_artist');
    expect(turn.text).toContain('12.3k');
    expect(turn.toolEvents[0]?.toolName).toBe('confirmSpotifyArtist');
    expect(turn.toolEvents[0]?.output.action).toBe('spotify_artist_confirmed');
  });

  it('degrades to the no-data line when Spotify enrichment fails', async () => {
    hoisted.getSpotifyArtistMock.mockRejectedValue(new Error('spotify down'));
    const turn = await decide([
      user('hey'),
      user('I picked Test Artist on Spotify.', { spotifyArtistId: 'artist-1' }),
    ]);
    expect(turn.line.stepId).toBe('confirm_artist_no_data');
    expect(turn.toolEvents[0]?.output.action).toBe('spotify_artist_confirmed');
  });

  it('moves to the handle check once the artist is confirmed', async () => {
    const turn = await decide([
      ...baseThroughArtist(),
      user('nice, what next?'),
    ]);
    expect(turn.line.stepId).toBe('handle');
    expect(turn.toolEvents[0]?.toolName).toBe('checkHandle');
    expect(turn.toolEvents[0]?.input.handle).toBe('testartist');
    expect(turn.text).toContain('@testartist');
    expect(turn.guardedStep).toBe('handle');
  });

  it('does not advance past handle on free-text ok/k', async () => {
    const turn = await decide([
      ...baseThroughArtist(),
      assistant('Claiming @testartist.', [HANDLE_CHECKED]),
      user('ok'),
    ]);
    expect(turn.guardedStep).toBe('handle');
    expect(turn.toolEvents.map(e => e.output.action)).not.toContain(
      'propose_next_step'
    );
    expect(turn.toolEvents.map(e => e.output.action)).not.toContain(
      'handle_confirmed'
    );
  });

  it('advances on structured handle_confirmed widget event', async () => {
    const turn = await decide([
      ...baseThroughArtist(),
      assistant('Claiming @testartist.', [HANDLE_CHECKED]),
      user('Confirmed handle @testartist', {
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.HANDLE_CONFIRMED,
        handle: 'testartist',
      }),
    ]);
    // Metadata event satisfies the handle guard; next step opens social.
    expect(turn.guardedStep).toBe('social');
    expect(turn.toolEvents.map(e => e.output.action)).toContain(
      'propose_social_link'
    );
  });

  it('advances social on Attach Account widget event', async () => {
    const lowSignal = {
      ...CONFIRMED_OUTPUT,
      artist: { ...CONFIRMED_OUTPUT.artist, followers: 120 },
    };
    const turn = await decide([
      user('hey'),
      assistant('Handle locked.', [
        { toolName: 'confirmSpotifyArtist', output: lowSignal },
        HANDLE_CONFIRMED,
        SOCIAL_PROPOSED,
      ]),
      user('Attached https://instagram.com/testartist', {
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.SOCIAL_ATTACHED,
        url: 'https://instagram.com/testartist',
      }),
    ]);
    // Low signal + attach → contact (audience) rather than forced waitlist.
    expect(turn.guardedStep).toBe('contact');
    expect(turn.line.stepId).toBe('ask_audience');
  });

  it('does not waitlist on incomplete k after handle+social', async () => {
    const lowSignal = {
      ...CONFIRMED_OUTPUT,
      artist: { ...CONFIRMED_OUTPUT.artist, followers: 120 },
    };
    const turn = await decide([
      user('hey'),
      assistant('Pulled you up.', [
        { toolName: 'confirmSpotifyArtist', output: lowSignal },
        HANDLE_CONFIRMED,
        SOCIAL_ATTACHED,
      ]),
      user('k'),
    ]);
    expect(turn.line.stepId).toBe('ask_audience');
    expect(turn.toolEvents.map(e => e.output.action)).not.toContain(
      'propose_next_step'
    );
    expect(turn.guardedStep).toBe('contact');
  });

  it('routes to instant access after widget confirms + real audience signal', async () => {
    const turn = await decide([
      ...baseThroughArtist(),
      assistant('Handle locked.', [HANDLE_CONFIRMED, SOCIAL_ATTACHED]),
      user('around 20k on instagram'),
    ]);
    // High Spotify followers already clear the bar once handle+social complete.
    expect(turn.line.stepId).toBe('instant_access');
    const actions = turn.toolEvents.map(event => event.output.action);
    expect(actions).toContain('propose_next_step');
    expect(actions).toContain('propose_checkout');
  });

  it('waitlists only with meaningful signal after turn cap', async () => {
    const lowSignal = {
      ...CONFIRMED_OUTPUT,
      artist: { ...CONFIRMED_OUTPUT.artist, followers: 120 },
    };
    const turn = await decide([
      user('hey'),
      assistant('Pulled you up.', [
        { toolName: 'confirmSpotifyArtist', output: lowSignal },
        HANDLE_CONFIRMED,
        SOCIAL_ATTACHED,
      ]),
      user('turn two — planning a single'),
      assistant('One thing before I route you: audience size?'),
      user('like 300 people'),
    ]);
    expect(turn.line.stepId).toBe('waitlist');
    expect(turn.toolEvents.map(event => event.output.action)).toContain(
      'propose_next_step'
    );
    expect(turn.toolEvents.map(event => event.toolName)).toContain(
      'recordInterviewSignal'
    );
  });

  it('promotes to instant access when the audience reply clears the bar', async () => {
    const lowSignal = {
      ...CONFIRMED_OUTPUT,
      artist: { ...CONFIRMED_OUTPUT.artist, followers: 120 },
    };
    const turn = await decide([
      user('hey'),
      assistant('Pulled you up.', [
        { toolName: 'confirmSpotifyArtist', output: lowSignal },
        HANDLE_CONFIRMED,
        SOCIAL_ATTACHED,
      ]),
      user('around 20k on instagram'),
    ]);
    expect(turn.line.stepId).toBe('instant_access');
  });

  it('reopens artist search on none-of-these widget event', async () => {
    const turn = await decide([
      user('hey'),
      assistant('Pick your artist below.', [
        {
          toolName: 'searchSpotifyArtist',
          output: { action: 'open_artist_picker', query: 'test' },
        },
      ]),
      user('None of these artists match', {
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.ARTIST_NONE_OF_THESE,
      }),
    ]);
    expect(turn.guardedStep).toBe('artist_search');
    expect(turn.toolEvents[0]?.toolName).toBe('searchSpotifyArtist');
    expect(turn.toolEvents[0]?.output.query).toBeNull();
  });

  it('points back at the card once a terminal decision exists', async () => {
    const turn = await decide([
      user('hey'),
      assistant('On the list.', [
        { toolName: 'confirmSpotifyArtist', output: CONFIRMED_OUTPUT },
        HANDLE_CONFIRMED,
        SOCIAL_ATTACHED,
        {
          toolName: 'proposeNextStep',
          output: {
            action: 'propose_next_step',
            decision: { kind: 'waitlist', rationale: 'x', score: 30 },
          },
        },
      ]),
      user('so now what'),
    ]);
    expect(turn.line.stepId).toBe('done');
    expect(turn.toolEvents).toHaveLength(0);
  });
});

describe('resolveGuardedStep', () => {
  it('returns role before any artist signal', () => {
    const messages = [user('hey')];
    expect(
      resolveGuardedStep({
        uiMessages: messages,
        state: stateFor(messages),
      })
    ).toBe('role');
  });

  it('returns handle until handle_confirmed fires', () => {
    const messages = [
      ...baseThroughArtist(),
      assistant('Claiming.', [HANDLE_CHECKED]),
      user('ok'),
    ];
    expect(
      resolveGuardedStep({
        uiMessages: messages,
        state: stateFor(messages),
      })
    ).toBe('handle');
  });
});
