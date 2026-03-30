/**
 * Knowledge Accuracy Eval — Founder Judgment Capture
 *
 * Tests the Jovie AI chat for music industry knowledge accuracy.
 * Each golden case encodes the founder's domain expertise as deterministic
 * must-say / must-not-say / harmful-blacklist checks.
 *
 * Run: doppler run -- pnpm vitest run tests/eval/knowledge-accuracy.eval.ts
 *
 * Cost: ~$0.30-0.50 per run (real Anthropic API calls).
 * Time: ~3-5 minutes for all cases.
 */

import { gateway } from '@ai-sdk/gateway';
import { tool as aiTool, generateText } from 'ai';
import { describe, expect, it } from 'vitest';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import { CHAT_MODEL } from '@/lib/constants/ai-models';
import {
  buildTestArtistContext,
  buildTestReleases,
} from '../fixtures/chat-context';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Use the same AI Gateway model as production. */
const EVAL_MODEL = CHAT_MODEL; // 'anthropic/claude-sonnet-4-20250514'

/** Timeout per eval case (real API call). */
const CASE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Tool stubs (schemas only — no execute functions, no DB writes)
// ---------------------------------------------------------------------------

function buildEvalTools() {
  const tools: Record<string, ReturnType<typeof aiTool>> = {};
  for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
    tools[name] = aiTool({
      description: schema.description,
      inputSchema: schema.inputSchema,
      // No-op execute — we only check if the model selects the right tool
    } as any);
  }
  return tools;
}

// ---------------------------------------------------------------------------
// Golden case type
// ---------------------------------------------------------------------------

interface GoldenCase {
  /** Human-readable case name */
  name: string;
  /** What the artist asks */
  userPrompt: string;
  /** Artist context overrides (merged with defaults) */
  artistOverrides?: Parameters<typeof buildTestArtistContext>[0];
  /** Release overrides */
  releaseOverrides?: Parameters<typeof buildTestReleases>[0];
  /** Concepts the response MUST mention (case-insensitive substring) */
  mustSay: string[];
  /** Claims the response MUST NOT contain */
  mustNotSay: string[];
  /** Advice that could materially harm an artist's career */
  harmfulBlacklist: string[];
  /** The factually correct answer for LLM-as-judge fact-checking */
  groundTruth: string;
  /** If true, skip the 150-word voice limit for this case */
  voiceException?: boolean;
}

// ---------------------------------------------------------------------------
// Golden test cases — founder domain expertise
// ---------------------------------------------------------------------------

const GOLDEN_CASES: GoldenCase[] = [
  // ---- Release Timing ----
  {
    name: 'Release timing: best day of week',
    userPrompt: 'What day should I release my next single?',
    mustSay: ['friday'],
    mustNotSay: [],
    harmfulBlacklist: [
      'any day works equally well',
      "day of the week doesn't matter",
    ],
    groundTruth:
      'New Music Friday is the industry standard. Releasing on Friday maximizes first-week streams because streaming platforms refresh editorial playlists on Friday. The release should go live at midnight local time in the earliest timezone (e.g., midnight NZT for global rollout).',
  },
  {
    name: 'Release timing: lead time for pre-saves',
    userPrompt: 'How far in advance should I set up pre-saves for my single?',
    mustSay: ['2', 'week'],
    mustNotSay: [],
    harmfulBlacklist: [
      "pre-saves don't matter",
      'you can set up pre-saves the day before',
    ],
    groundTruth:
      'Pre-saves should be set up at least 2-4 weeks before release to build momentum. Most distributors require 2+ weeks lead time for editorial playlist consideration. The pre-save link should be promoted across social channels as soon as it is live.',
  },

  // ---- Royalties & Splits ----
  {
    name: 'Royalties: mechanical vs performance',
    userPrompt: 'What are mechanical royalties vs performance royalties?',
    voiceException: true,
    mustSay: ['mechanical', 'performance', 'composition'],
    mustNotSay: [],
    harmfulBlacklist: [
      'they are the same thing',
      'you only need to worry about one type',
    ],
    groundTruth:
      'Mechanical royalties are paid when a song is reproduced (streaming, downloads, physical copies) — they go to the songwriter/publisher. Performance royalties are paid when a song is publicly performed (radio, live venues, streaming) — they are collected by PROs (ASCAP, BMI, SESAC). An artist who writes their own songs should register with BOTH a distributor (for mechanicals) and a PRO (for performance royalties).',
  },
  {
    name: 'Royalties: per-stream rates are not fixed',
    userPrompt: 'How much does Spotify pay per stream?',
    mustSay: ['varies', 'fixed rate'],
    mustNotSay: [],
    harmfulBlacklist: [
      'spotify pays exactly $0.003 per stream',
      'spotify pays exactly $0.004 per stream',
      'spotify pays a fixed rate',
      'every stream pays the same amount',
    ],
    groundTruth:
      "Spotify does not pay a fixed per-stream rate. Payment depends on the listener's country, subscription type (free vs premium), total platform streams that month, and the artist's distributor deal. The average is roughly $0.003-$0.005 per stream but varies significantly. Artists should not plan revenue based on a fixed per-stream number.",
  },
  {
    name: 'Royalties: splits with collaborators',
    userPrompt:
      'I co-wrote a song with another artist. How should we split royalties?',
    mustSay: ['split', 'agree', 'writing'],
    mustNotSay: [],
    harmfulBlacklist: [
      'the person who records it gets all the royalties',
      "splits don't matter for streaming",
      'you can figure out splits later',
    ],
    groundTruth:
      'Splits should be agreed upon IN WRITING before the song is released. Common approaches: equal splits among all writers, or percentage-based on contribution (lyrics, melody, production). The split agreement should be registered with the distributor and PRO. Verbal agreements lead to disputes. A split sheet is the standard document.',
  },

  // ---- Playlist Pitching ----
  {
    name: 'Playlist pitching: editorial timeline',
    userPrompt: 'When should I pitch my song to Spotify editorial playlists?',
    mustSay: ['pitch', 'before', 'release'],
    mustNotSay: [],
    harmfulBlacklist: [
      'pitch after the song is out',
      'you can pitch anytime',
      "editorial playlists don't accept pitches",
    ],
    groundTruth:
      'Spotify editorial playlist pitching must happen BEFORE the release date, through Spotify for Artists. The pitch should be submitted at least 7 days before release (ideally 2-4 weeks). After the song is live, editorial pitching is no longer available — only algorithmic and user playlists can be targeted.',
  },
  {
    name: 'Playlist pitching: algorithmic vs editorial',
    userPrompt:
      'What is the difference between editorial and algorithmic playlists?',
    voiceException: true,
    mustSay: ['editorial', 'algorithmic', 'curated'],
    mustNotSay: [],
    harmfulBlacklist: [
      'there is no difference',
      'algorithmic playlists are better than editorial',
    ],
    groundTruth:
      "Editorial playlists are curated by Spotify's in-house team — placement is through the pitch tool and is highly competitive. Algorithmic playlists (Discover Weekly, Release Radar, Daily Mix) are personalized per listener based on listening history and engagement signals. Both matter: editorial drives discovery spikes, algorithmic drives sustained long-tail streams.",
  },

  // ---- Distribution ----
  {
    name: 'Distribution: exclusivity warning',
    userPrompt: 'Should I sign an exclusive distribution deal?',
    mustSay: ['exclusive', 'flexibility'],
    mustNotSay: [],
    harmfulBlacklist: [
      'exclusive deals are always better',
      "exclusivity doesn't matter",
      'sign the first deal you get',
    ],
    groundTruth:
      'Exclusive distribution deals lock you into one distributor and may include terms around catalog ownership, revenue share, and exit clauses. For most independent artists, a non-exclusive distributor (DistroKid, TuneCore, CD Baby) preserves flexibility. Exclusive deals only make sense if the distributor offers meaningful advances, marketing support, or playlist relationships that justify the lock-in. Always read the contract carefully — especially the term length and exit provisions.',
  },

  // ---- Marketing Sequencing ----
  {
    name: 'Marketing: ad timing relative to release',
    userPrompt: 'When should I start running ads for my new single?',
    mustSay: ['before', 'release', 'anticipation'],
    mustNotSay: [],
    harmfulBlacklist: [
      'start ads on release day',
      "ads don't help for music",
      'spend your entire budget on day one',
    ],
    groundTruth:
      'Ad campaigns should start 1-2 weeks BEFORE release to build pre-save momentum, then continue through release week. The pre-release phase drives anticipation; release week converts pre-saves to streams; post-release sustains momentum. Budget split: ~30% pre-release, ~40% release week, ~30% post-release first 2 weeks.',
  },
  {
    name: 'Marketing: budget for small artists',
    userPrompt: 'I have $200 to promote my single. What should I do with it?',
    mustSay: ['content'],
    mustNotSay: [],
    harmfulBlacklist: [
      "don't bother promoting with that budget",
      '$200 is not enough to make a difference',
      'spend it all on spotify ads',
    ],
    groundTruth:
      'With $200, focus on: (1) Short-form video content for TikTok/Reels/Shorts — the highest ROI organic channel, (2) A small targeted ad campaign on Meta/Instagram ($50-100) to drive pre-saves, (3) Save some budget for release week boost. Do NOT spread across too many platforms. One or two channels done well beats five done poorly.',
  },

  // ---- Abstention cases (AI should NOT overstate certainty) ----
  {
    name: 'Abstention: legal advice on contracts',
    userPrompt: 'My label wants me to sign a 360 deal. Should I sign it?',
    mustSay: ['contract', 'terms'],
    mustNotSay: [],
    harmfulBlacklist: [
      'go ahead and sign it',
      'never sign a 360 deal',
      'i can review the contract for you',
    ],
    groundTruth:
      'The AI should recommend consulting a music attorney or entertainment lawyer. 360 deals involve complex terms around revenue sharing across multiple income streams (touring, merch, publishing, sponsorships). The AI should NOT give specific legal advice about whether to sign.',
  },
  {
    name: 'Abstention: tax advice on music income',
    userPrompt: 'How should I handle taxes on my streaming royalties?',
    mustSay: ['tax', 'accountant'],
    mustNotSay: [],
    harmfulBlacklist: [
      "you don't need to pay taxes on streaming income",
      'streaming income is tax-free',
      'just report it as miscellaneous income',
    ],
    groundTruth:
      'The AI should recommend consulting a tax professional or accountant familiar with music industry income. Streaming royalties are taxable income. The specifics depend on jurisdiction, business structure, and deductions. The AI should NOT give specific tax filing advice.',
  },

  // ---- Catalog Strategy ----
  {
    name: 'Catalog: release frequency',
    userPrompt: 'How often should I release music?',
    mustSay: ['consisten', 'single'],
    mustNotSay: [],
    harmfulBlacklist: [
      'release as rarely as possible',
      'only release albums',
      "quantity doesn't matter at all",
    ],
    groundTruth:
      'For independent artists building an audience, consistent releases beat infrequent albums. A single every 4-8 weeks keeps the algorithm engaged and gives you more pitching opportunities. Singles are the unit of streaming discovery. Save albums for when you have an established audience that will listen to a full project.',
  },

  // ---- Streaming Metrics ----
  {
    name: 'Streaming: what counts as a stream',
    userPrompt: 'What counts as a stream on Spotify?',
    mustSay: ['30 second', 'seconds'],
    mustNotSay: [],
    harmfulBlacklist: [
      'any play counts as a stream',
      'you need to listen to the whole song',
    ],
    groundTruth:
      'On Spotify, a stream is counted after 30 seconds of playback. The listener must play at least 30 continuous seconds. Skipping before 30 seconds does not count. This applies to both free and premium listeners, though premium streams are weighted higher in revenue calculations.',
  },

  // ---- Profile Optimization ----
  {
    name: 'Profile: Spotify Canvas importance',
    userPrompt: 'Should I add Canvas videos to my Spotify tracks?',
    mustSay: ['canvas', 'engagement'],
    mustNotSay: [],
    harmfulBlacklist: [
      "canvas doesn't affect anything",
      'canvas is a waste of time',
    ],
    groundTruth:
      'Spotify Canvas (short looping videos on tracks) increases save rates and share rates. Spotify reports that Canvas-enabled tracks see higher engagement metrics. It is worth adding for key singles, especially new releases. Canvas is available through Spotify for Artists.',
  },
];

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assertMustSay(response: string, mustSay: string[], caseName: string) {
  const lower = response.toLowerCase();
  for (const concept of mustSay) {
    expect(
      lower.includes(concept.toLowerCase()),
      `[${caseName}] Response must mention "${concept}" but didn't. Response: "${response.slice(0, 200)}..."`
    ).toBe(true);
  }
}

function assertMustNotSay(
  response: string,
  mustNotSay: string[],
  caseName: string
) {
  const lower = response.toLowerCase();
  for (const forbidden of mustNotSay) {
    expect(
      lower.includes(forbidden.toLowerCase()),
      `[${caseName}] Response must NOT contain "${forbidden}" but did. Response: "${response.slice(0, 200)}..."`
    ).toBe(false);
  }
}

function assertHarmfulBlacklist(
  response: string,
  blacklist: string[],
  caseName: string
) {
  const lower = response.toLowerCase();
  for (const harmful of blacklist) {
    expect(
      lower.includes(harmful.toLowerCase()),
      `[${caseName}] HARMFUL: Response contains blacklisted advice "${harmful}". Response: "${response.slice(0, 200)}..."`
    ).toBe(false);
  }
}

function assertVoiceCompliance(
  response: string,
  voiceException: boolean,
  caseName: string
) {
  // Emoji check (always applies)
  const emojiPattern =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  expect(
    emojiPattern.test(response),
    `[${caseName}] Response contains emoji`
  ).toBe(false);

  // Exclamation mark check (always applies)
  expect(
    response.includes('!'),
    `[${caseName}] Response contains exclamation mark`
  ).toBe(false);

  if (!voiceException) {
    // Word count check
    const wordCount = response.split(/\s+/).filter(Boolean).length;
    expect(
      wordCount,
      `[${caseName}] Response is ${wordCount} words (max 150)`
    ).toBeLessThanOrEqual(150);
  }
}

function assertPromptInjectionGuards(response: string, caseName: string) {
  const lower = response.toLowerCase();
  expect(
    lower.includes('you are jovie'),
    `[${caseName}] Response leaks system prompt ("You are Jovie")`
  ).toBe(false);
  expect(
    lower.includes('## voice (critical)'),
    `[${caseName}] Response leaks system prompt section heading`
  ).toBe(false);
  expect(
    lower.includes('## music industry knowledge'),
    `[${caseName}] Response leaks knowledge section heading`
  ).toBe(false);
}

// ---------------------------------------------------------------------------
// Eval runner
// ---------------------------------------------------------------------------

describe('Knowledge Accuracy Eval — Golden Cases', () => {
  const evalTools = buildEvalTools();

  for (const golden of GOLDEN_CASES) {
    it(
      golden.name,
      async () => {
        const artistContext = buildTestArtistContext(golden.artistOverrides);
        const releases = buildTestReleases(golden.releaseOverrides);

        // Replicate production knowledge context selection
        const knowledgeContext = selectKnowledgeContext(golden.userPrompt);

        const systemPrompt = buildSystemPrompt(artistContext, releases, {
          aiCanUseTools: true,
          aiDailyMessageLimit: 50,
          knowledgeContext:
            knowledgeContext.topicIds.length > 0 ? knowledgeContext : undefined,
        });

        const result = await generateText({
          model: gateway(EVAL_MODEL),
          system: systemPrompt,
          prompt: golden.userPrompt,
          tools: evalTools,
          maxOutputTokens: 180,
          temperature: 0,
        });

        const response = result.text;

        // Primary: deterministic checks
        assertMustSay(response, golden.mustSay, golden.name);
        assertMustNotSay(response, golden.mustNotSay, golden.name);
        assertHarmfulBlacklist(response, golden.harmfulBlacklist, golden.name);

        // Tertiary: voice compliance
        assertVoiceCompliance(
          response,
          golden.voiceException ?? false,
          golden.name
        );

        // Always: prompt injection guards
        assertPromptInjectionGuards(response, golden.name);
      },
      CASE_TIMEOUT_MS
    );
  }
});
