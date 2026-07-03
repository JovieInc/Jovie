/**
 * Pinned bake-off script for GitHub #12768.
 * Same persona prompt + 5-turn flow + mid-call tool for xAI vs ElevenLabs ConvAI.
 */

export const BAKE_OFF_ISSUE = 'gh-12768' as const;

export const JOVIE_VOICE_PERSONA_PROMPT = `You are Jovie, an AI music career manager for independent artists. You speak naturally, briefly, and warmly — like a trusted manager, not a call center bot.

Rules:
- Title Case for product names (Jovie, Spotify).
- Never invent release dates, stream counts, or fan numbers — only use tool results.
- If a tool fails, say so honestly and offer a fallback (open the Jovie app).
- Keep each reply under 3 sentences unless the artist asks for detail.
- When the artist is done, confirm next steps and end the call cleanly.`;

export interface BakeOffToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** Mid-call tool both stacks must invoke on turn 3. */
export const BAKE_OFF_LOOKUP_RELEASE_TOOL: BakeOffToolDefinition = {
  name: 'lookup_upcoming_release',
  description:
    'Fetch the artist upcoming release title, drop date (ISO), and count of draft social posts.',
  parameters: {
    type: 'object',
    properties: {
      artistId: {
        type: 'string',
        description: 'Stable Jovie profile / artist identifier.',
      },
    },
    required: ['artistId'],
  },
};

export interface BakeOffToolFixtureResult {
  readonly releaseTitle: string;
  readonly releaseDateIso: string;
  readonly draftPostCount: number;
}

export const BAKE_OFF_TOOL_FIXTURE: BakeOffToolFixtureResult = {
  releaseTitle: 'Midnight Signals',
  releaseDateIso: '2026-07-18',
  draftPostCount: 4,
};

export interface BakeOffTurn {
  readonly turn: number;
  readonly role: 'user' | 'assistant';
  readonly utterance: string;
  readonly expectsToolCall?: boolean;
  readonly expectedToolName?: string;
}

/**
 * Five-turn call flow. Turn 3 must trigger lookup_upcoming_release(artistId).
 * Human judges voice quality on assistant turns 2, 4, and 5.
 */
export const BAKE_OFF_FIVE_TURN_FLOW: readonly BakeOffTurn[] = [
  {
    turn: 1,
    role: 'user',
    utterance:
      'Hey Jovie — it is Luna. I have a single dropping soon and I want to make sure I am not missing anything.',
  },
  {
    turn: 2,
    role: 'assistant',
    utterance:
      'Hey Luna — I can pull your upcoming release and see what is already drafted. Want me to check your release plan now?',
  },
  {
    turn: 3,
    role: 'user',
    utterance: 'Yes, please look up what I have for Midnight Signals.',
    expectsToolCall: true,
    expectedToolName: 'lookup_upcoming_release',
  },
  {
    turn: 4,
    role: 'assistant',
    utterance:
      'Midnight Signals drops July 18. You have four draft social posts ready — want me to queue them or tweak copy first?',
  },
  {
    turn: 5,
    role: 'user',
    utterance:
      'Queue them for Thursday morning. That is all — thanks Jovie.',
  },
];

export function getBakeOffToolArgs(artistId = 'artist_luna_waves_demo'): {
  readonly artistId: string;
} {
  return { artistId };
}

export function executeBakeOffToolFixture(): BakeOffToolFixtureResult {
  return { ...BAKE_OFF_TOOL_FIXTURE };
}