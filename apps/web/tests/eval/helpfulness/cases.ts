/**
 * Jovie helpfulness eval cases (versioned with HELPFULNESS_EVAL_VERSION).
 *
 * Each case is a realistic artist ask against a synthetic fixture. Hard checks
 * are deterministic; `great` tells the judge what a top answer does.
 * New cases from real conversations must be anonymized: rewrite the ask in
 * your own words, map the artist onto a fixture, never paste user text.
 */

import type { FixtureId } from './fixtures';

export interface HelpfulnessCase {
  readonly id: string;
  readonly fixture: FixtureId;
  /** Prior turns, oldest first, for multi-turn cases. */
  readonly history?: readonly { role: 'user' | 'assistant'; text: string }[];
  readonly ask: string;
  /**
   * Grounding hard check: every group must have at least one
   * case-insensitive match in the reply or in a tool call's input.
   */
  readonly mustMentionAny?: readonly (readonly string[])[];
  /** At least one of these tools must be called. */
  readonly expectToolsAny?: readonly string[];
  /** Word cap for the final text; default DEFAULT_MAX_WORDS. */
  readonly maxWords?: number;
  /** What a great reply does. Judge guidance only. */
  readonly great: string;
  /** Run in the cheap CI live subset. */
  readonly ciSubset?: boolean;
}

export const DEFAULT_MAX_WORDS = 170;

export const HELPFULNESS_CASES: readonly HelpfulnessCase[] = [
  {
    id: 'week-plan',
    fixture: 'established',
    ask: 'what should I do this week?',
    mustMentionAny: [['night swim']],
    great:
      'Notices Night Swim drops Friday and makes the week about that launch: one concrete first step for today (e.g. put the Night Swim pre-save/smart link in the Instagram bio, since Instagram drives most profile visits).',
    ciSubset: true,
  },
  {
    id: 'song-out-friday',
    fixture: 'established',
    ask: 'my song comes out friday. what do I do',
    mustMentionAny: [['night swim'], ['friday', 'days', 'tomorrow', 'today']],
    great:
      'Knows the song is Night Swim, counts the days, gives the single most important pre-release move now and what to do on release day. Short.',
    ciSubset: true,
  },
  {
    id: 'more-listeners',
    fixture: 'established',
    ask: 'how do I get more listeners',
    mustMentionAny: [
      [
        'night swim',
        'neon reef',
        'tidal drift',
        '12,500',
        '12.5k',
        'instagram',
      ],
    ],
    great:
      'Ties growth to the Night Swim release this week and the Instagram traffic signal, not a list of generic tips. One move.',
    ciSubset: true,
  },
  {
    id: 'smartlink',
    fixture: 'established',
    ask: 'set up my smartlink for the new single',
    mustMentionAny: [['night swim']],
    great:
      'Identifies Night Swim as the new single, explains its release page / smart link lives on the Jovie profile (jov.ie/lunawaves) and gives the exact next step; does not ask which single.',
  },
  {
    id: 'streams-dropped',
    fixture: 'established',
    ask: 'why did my streams drop',
    mustMentionAny: [
      [
        'neon reef',
        'stream count',
        'daily stream',
        "don't see",
        'cannot see',
        "can't see",
        'not see',
      ],
    ],
    great:
      'Honest that Jovie does not see daily stream counts; uses what it does see (Neon Reef is ~2 months old, post-release decay is normal, Night Swim lands Friday) and gives one concrete check or action.',
  },
  {
    id: 'best-release',
    fixture: 'established',
    ask: "what's my best performing release?",
    mustMentionAny: [['tidal drift']],
    great:
      'Says Tidal Drift (popularity 41) leads, Neon Reef 38; notes Night Swim is not out yet. Offers one use of that fact.',
  },
  {
    id: 'whats-next-release',
    fixture: 'established',
    ask: 'when is my next release?',
    mustMentionAny: [['night swim'], ['friday', 'tomorrow', 'today']],
    great:
      'Night Swim, this Friday, with the date. One line plus one prep step.',
    ciSubset: true,
  },
  {
    id: 'release-day-caption',
    fixture: 'established',
    ask: 'write me a caption for release day',
    mustMentionAny: [['night swim']],
    maxWords: 200,
    great:
      'Writes a ready-to-post caption for Night Swim in the artist register, with the link placement; no hashtag spam, no emoji walls.',
  },
  {
    id: 'pitch-playlists',
    fixture: 'established',
    ask: 'should I pitch the new single to playlists?',
    mustMentionAny: [['night swim']],
    great:
      'Yes with timing reality: Spotify editorial pitch needs lead time before Friday, so say what is still possible for Night Swim now (curator pitch via the pitch tool) and do it or offer to.',
  },
  {
    id: 'profile-visits',
    fixture: 'established',
    ask: 'how many people visited my profile?',
    mustMentionAny: [['3,200', '3200', '3.2k']],
    great: '3,200 views, one line of context, one move.',
  },
  {
    id: 'tips-earned',
    fixture: 'established',
    ask: 'how much have I made from tips?',
    mustMentionAny: [['150'], ['25']],
    great:
      '$150 total, $25 this month, 8 tips from 42 clicks; one specific way to lift it (e.g. tip link in the Night Swim release post).',
  },
  {
    id: 'make-money',
    fixture: 'established',
    ask: 'how do I make more money from my music',
    mustMentionAny: [['tip', 'merch', 'night swim', '150']],
    great:
      'Grounds in what is already earning (tips: $150, 19% conversion) and the Friday release; picks one revenue move with Jovie (merch from a catalog title or tip push), not a list of income streams.',
  },
  {
    id: 'idk-what-to-post',
    fixture: 'established',
    ask: 'idk what to post today',
    mustMentionAny: [['night swim']],
    great:
      'Gives one post idea tied to the Night Swim countdown, ready to use (hook line + what to film).',
  },
  {
    id: 'tiktok-growth',
    fixture: 'established',
    ask: 'how do I grow on tiktok',
    mustMentionAny: [['night swim', 'neon reef', 'tidal drift', 'ambient']],
    great:
      'Specific to an ambient producer with a single out Friday: one repeatable format using Night Swim, not a generic TikTok tips list.',
  },
  {
    id: 'paid-promo',
    fixture: 'established',
    ask: 'is it worth paying for playlist promotion services?',
    great:
      'Takes a position (most paid placement services are bot-risk; never pay for guaranteed streams), then redirects to the legitimate move for Night Swim.',
  },
  {
    id: 'presave',
    fixture: 'established',
    ask: 'should I set up a pre-save?',
    mustMentionAny: [['night swim'], ['friday', 'days', 'tomorrow', 'today']],
    great:
      'Yes, for Night Swim, days are short so do it today; says where it lives in Jovie or the exact next step.',
  },
  {
    id: 'greeting',
    fixture: 'established',
    ask: 'hi',
    mustMentionAny: [['night swim']],
    maxWords: 80,
    great:
      'Short hello that leads with the one thing that matters now (Night Swim drops Friday) and offers the next step. Not a capability list.',
    ciSubset: true,
  },
  {
    id: 'what-can-you-do',
    fixture: 'established',
    ask: 'what can you do?',
    mustMentionAny: [['night swim', 'release', 'pitch', 'merch']],
    great:
      'Two or three capabilities framed around this artist (e.g. pitch Night Swim, plan the launch, merch from Tidal Drift), ending with the best one to start with.',
  },
  {
    id: 'new-where-start',
    fixture: 'new',
    ask: "I don't have any music out yet. where do I start?",
    great:
      'Acknowledges no releases and an empty profile; gives the first concrete step in Jovie (connect Spotify or add a link/bio so jov.ie/maraquill is live) rather than a career essay.',
    ciSubset: true,
  },
  {
    id: 'new-week-plan',
    fixture: 'new',
    ask: 'what should I do this week?',
    great:
      'Knows the profile is empty; picks the one setup step that unlocks the rest this week. Does not invent releases or stats.',
  },
  {
    id: 'lapsed-flopped',
    fixture: 'lapsed',
    ask: 'my last release kind of flopped. what now?',
    mustMentionAny: [['low tide choir']],
    great:
      'Names Low Tide Choir (popularity 14, ~4 months ago), no false cheer, and proposes the next release plan or one recovery move with a date.',
    ciSubset: true,
  },
  {
    id: 'lapsed-plan-release',
    fixture: 'lapsed',
    ask: 'help me plan my next release',
    mustMentionAny: [['low tide choir', 'signal fires', 'weeks', 'date']],
    expectToolsAny: ['createPromoStrategy', 'manageTasks', 'createRelease'],
    great:
      'Uses the planning/task tool or proposes a concrete dated timeline anchored on a Friday release date, informed by the gap since Low Tide Choir.',
  },
  {
    id: 'update-bio',
    fixture: 'lapsed',
    ask: 'can you write me a better bio',
    expectToolsAny: ['writeWorldClassBio', 'proposeProfileEdit'],
    great: 'Calls the bio tool right away rather than asking questions first.',
  },
  {
    id: 'collab',
    fixture: 'established',
    ask: 'who should I collaborate with?',
    expectToolsAny: ['suggestRelatedArtists'],
    great:
      'Calls suggestRelatedArtists and frames the result around one outreach move.',
  },
  {
    id: 'followup-do-it',
    fixture: 'established',
    history: [
      { role: 'user', text: 'what should I focus on' },
      {
        role: 'assistant',
        text: 'Night Swim is out Friday. Get a curator pitch out today.',
      },
    ],
    ask: 'ok do it',
    expectToolsAny: ['generateReleasePitch'],
    great:
      'Acts: calls generateReleasePitch for Night Swim (asking only the destination if truly needed) instead of re-explaining.',
  },
];
