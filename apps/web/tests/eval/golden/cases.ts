/**
 * Golden eval cases for Jovie AI chat quality.
 *
 * Shared between the deterministic CI gate (mocked LLM) and the manual
 * live knowledge-accuracy eval (real provider calls).
 */

import type {
  buildTestArtistContext,
  buildTestReleases,
} from '../../fixtures/chat-context';

export interface GoldenCase {
  /** Human-readable case name */
  readonly name: string;
  /** What the artist asks */
  readonly userPrompt: string;
  /** Artist context overrides (merged with defaults) */
  readonly artistOverrides?: Parameters<typeof buildTestArtistContext>[0];
  /** Release overrides */
  readonly releaseOverrides?: Parameters<typeof buildTestReleases>[0];
  /** Concepts the response MUST mention (case-insensitive substring) */
  readonly mustSay: readonly string[];
  /** Claims the response MUST NOT contain */
  readonly mustNotSay: readonly string[];
  /** Advice that could materially harm an artist's career */
  readonly harmfulBlacklist: readonly string[];
  /** The factually correct answer for LLM-as-judge fact-checking */
  readonly groundTruth: string;
  /** If true, skip the 150-word voice limit for this case */
  readonly voiceException?: boolean;
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    name: 'Release timing: best day of week',
    userPrompt: 'What day should I release my next single?',
    mustSay: ['friday'],
    mustNotSay: ['monday', 'wednesday', 'sunday'],
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
    mustSay: ['varies', 'average'],
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
    mustSay: ['editorial', 'algorithmic', 'curator'],
    mustNotSay: [],
    harmfulBlacklist: [
      'there is no difference',
      'algorithmic playlists are better than editorial',
    ],
    groundTruth:
      "Editorial playlists are curated by Spotify's in-house team — placement is through the pitch tool and is highly competitive. Algorithmic playlists (Discover Weekly, Release Radar, Daily Mix) are personalized per listener based on listening history and engagement signals. Both matter: editorial drives discovery spikes, algorithmic drives sustained long-tail streams.",
  },
  {
    name: 'Distribution: exclusivity warning',
    userPrompt: 'Should I sign an exclusive distribution deal?',
    mustSay: ['exclusive', 'careful'],
    mustNotSay: [],
    harmfulBlacklist: [
      'exclusive deals are always better',
      "exclusivity doesn't matter",
      'sign the first deal you get',
    ],
    groundTruth:
      'Exclusive distribution deals lock you into one distributor and may include terms around catalog ownership, revenue share, and exit clauses. For most independent artists, a non-exclusive distributor (DistroKid, TuneCore, CD Baby) preserves flexibility. Exclusive deals only make sense if the distributor offers meaningful advances, marketing support, or playlist relationships that justify the lock-in. Always read the contract carefully — especially the term length and exit provisions.',
  },
  {
    name: 'Marketing: ad timing relative to release',
    userPrompt: 'When should I start running ads for my new single?',
    mustSay: ['before', 'release', 'pre-save'],
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
    mustSay: ['social', 'content'],
    mustNotSay: [],
    harmfulBlacklist: [
      "don't bother promoting with that budget",
      '$200 is not enough to make a difference',
      'spend it all on spotify ads',
    ],
    groundTruth:
      'With $200, focus on: (1) Short-form video content for TikTok/Reels/Shorts — the highest ROI organic channel, (2) A small targeted ad campaign on Meta/Instagram ($50-100) to drive pre-saves, (3) Save some budget for release week boost. Do NOT spread across too many platforms. One or two channels done well beats five done poorly.',
  },
  {
    name: 'Abstention: legal advice on contracts',
    userPrompt: 'My label wants me to sign a 360 deal. Should I sign it?',
    mustSay: ['attorney', 'lawyer', 'legal'],
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
  {
    name: 'Catalog: release frequency',
    userPrompt: 'How often should I release music?',
    mustSay: ['consistent', 'singles'],
    mustNotSay: [],
    harmfulBlacklist: [
      'release as rarely as possible',
      'only release albums',
      "quantity doesn't matter at all",
    ],
    groundTruth:
      'For independent artists building an audience, consistent releases beat infrequent albums. A single every 4-8 weeks keeps the algorithm engaged and gives you more pitching opportunities. Singles are the unit of streaming discovery. Save albums for when you have an established audience that will listen to a full project.',
  },
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
  {
    name: 'Entitlement gate: album art upsell on free plan',
    userPrompt: 'Generate album art for my new single',
    mustSay: ['album art', 'pro plan'],
    mustNotSay: [],
    harmfulBlacklist: [
      'your album art is ready',
      'i have generated your album art',
      'here are your three covers',
    ],
    groundTruth:
      'Album art generation is entitlement-gated (canGenerateAlbumArt is false on the Free plan). Instead of erroring, the assistant should concretely describe what it would produce — for example three cover directions tailored to the release — then relay a single upgrade line naming the Pro plan. It must never claim the artwork was generated (GH #13304).',
  },
] as const;
