/**
 * ASS-12 quota fill: release plan, which-song, what-to-post.
 */

import type { HelpfulnessCase } from './case-types';

export const QUOTA_RELEASE_POST_CASES: readonly HelpfulnessCase[] = [
  {
    id: 'release-plan-two-weeks',
    fixture: 'established',
    ask: 'map the next two weeks around Night Swim',
    mustMentionAny: [['night swim']],
    great:
      'Makes the next 2 weeks about Night Swim as the one primary push: concrete beats for pre-release and release day, not a tip dump.',
  },
  {
    id: 'release-plan-primary-push',
    fixture: 'established',
    ask: 'I have Night Swim Friday and also want to revive Neon Reef. what is the one push?',
    mustMentionAny: [['night swim']],
    great:
      'Picks Night Swim as the primary push this week; Neon Reef waits. One plan, not both.',
  },
  {
    id: 'release-plan-pre-fri',
    fixture: 'established',
    ask: 'what is the single most important thing before Night Swim drops?',
    mustMentionAny: [['night swim']],
    great:
      'Names one pre-Friday move for Night Swim (bio/smart link/presave) grounded in Instagram traffic, short.',
  },
  {
    id: 'release-plan-day-of',
    fixture: 'established',
    ask: 'it is release day for Night Swim. run the day',
    mustMentionAny: [['night swim']],
    great:
      'One release-day sequence for Night Swim: post, link, listen CTA. No invented chart numbers.',
  },
  {
    id: 'release-plan-post-week',
    fixture: 'established',
    ask: 'Night Swim is out. what does week one look like?',
    mustMentionAny: [['night swim']],
    great:
      'One primary week-one plan for Night Swim (content + link focus), not a generic calendar.',
  },
  {
    id: 'release-plan-lapsed-comeback',
    fixture: 'lapsed',
    ask: 'I have been quiet for months. plan a small comeback release window',
    mustMentionAny: [['low tide', 'signal fires', 'harbor']],
    great:
      'Uses Low Tide Choir / Signal Fires context for Harbor Static and proposes one small release window, not a full campaign menu.',
  },
  {
    id: 'release-plan-new-first',
    fixture: 'new',
    ask: 'I have nothing out yet. what is a realistic first-release plan?',
    mustMentionAny: [
      ['release', 'single', 'first', 'connect', 'spotify', 'link'],
    ],
    great:
      'For Mara Quill with an empty catalog: one first-release plan that starts with connecting music and a single, no invented stats.',
  },
  {
    id: 'song-push-tidal',
    fixture: 'established',
    ask: 'should I push Tidal Drift or Neon Reef right now?',
    mustMentionAny: [['tidal drift', 'neon reef', 'night swim']],
    great:
      'Uses catalog facts (Tidal Drift popularity 41 vs Neon Reef 38) and Night Swim timing to pick one push.',
  },
  {
    id: 'song-push-best-now',
    fixture: 'established',
    ask: 'which track should get the Instagram push this week?',
    mustMentionAny: [['night swim']],
    great:
      'Chooses Night Swim (Friday drop) over catalog for this week Instagram push; grounds in fixture.',
  },
  {
    id: 'song-push-catalog-leader',
    fixture: 'established',
    ask: 'ignore the new single for a second - which catalog track is strongest?',
    mustMentionAny: [['tidal drift']],
    great:
      'Names Tidal Drift (41) as catalog leader vs Neon Reef 38 / Coral EP; one use of that fact.',
  },
  {
    id: 'song-push-neon-vs-coral',
    fixture: 'established',
    ask: 'Neon Reef or Coral EP for a throwback post?',
    mustMentionAny: [['neon reef', 'coral']],
    great:
      'Picks one using popularity (Neon Reef 38 vs Coral EP 33) and says why briefly.',
  },
  {
    id: 'song-push-followers-context',
    fixture: 'established',
    ask: 'with 12.5k followers, which song deserves playlist focus?',
    mustMentionAny: [['night swim', 'tidal drift', '12,500', '12.5k', '12500']],
    great:
      'Ties playlist focus to Night Swim timing or Tidal Drift strength using real fixture numbers; one pick.',
  },
  {
    id: 'song-push-lapsed-pick',
    fixture: 'lapsed',
    ask: 'which of my old songs should I lean on for a return post?',
    mustMentionAny: [['low tide', 'signal fires']],
    great:
      'Picks Low Tide Choir or Signal Fires with popularity context for Harbor Static; one rec.',
  },
  {
    id: 'song-push-decline',
    fixture: 'established',
    ask: 'everything feels stuck. which song is least dead?',
    mustMentionAny: [['tidal drift', 'neon reef', 'night swim']],
    great:
      'Uses popularity/age from fixture to name the strongest live track and one move; does not invent streams.',
  },
  {
    id: 'post-ig-this-week',
    fixture: 'established',
    ask: 'what should I post on Instagram this week?',
    mustMentionAny: [['night swim', 'instagram']],
    great:
      'One Instagram plan tied to Night Swim / Instagram-as-traffic; not a content pillar list.',
  },
  {
    id: 'post-tiktok-night-swim',
    fixture: 'established',
    ask: 'give me one TikTok idea for Night Swim, not five',
    mustMentionAny: [['night swim']],
    great:
      'One concrete Night Swim TikTok concept ready to shoot; holds any draft for the artist.',
  },
  {
    id: 'post-stories-countdown',
    fixture: 'established',
    ask: 'Stories countdown for Night Swim - what do I actually post?',
    mustMentionAny: [['night swim']],
    great:
      'One Stories countdown sequence for Night Swim with link placement; short.',
  },
  {
    id: 'post-youtube-short',
    fixture: 'established',
    ask: 'should I do a YouTube Short for the drop?',
    mustMentionAny: [['night swim']],
    great:
      'Yes/no with one Short concept for Night Swim; does not invent YouTube analytics.',
  },
  {
    id: 'post-carousel-credits',
    fixture: 'established',
    ask: 'carousel post idea for Tidal Drift deep cuts',
    mustMentionAny: [['tidal drift']],
    great:
      'One carousel concept grounded in Tidal Drift being the album; no emoji walls.',
  },
  {
    id: 'post-reel-neon',
    fixture: 'established',
    ask: 'Reel idea that uses Neon Reef without feeling desperate',
    mustMentionAny: [['neon reef']],
    great: 'One Neon Reef Reel angle that fits ambient voice; one CTA.',
  },
  {
    id: 'post-lapsed-return',
    fixture: 'lapsed',
    ask: 'first post back after radio silence - what is it?',
    mustMentionAny: [['low tide', 'signal fires', 'harbor']],
    great:
      'One return post for Harbor Static naming a real track; honest tone, not fake comeback hype.',
  },
  {
    id: 'post-new-nothing',
    fixture: 'new',
    ask: 'I have no music out. what do I post?',
    mustMentionAny: [
      [
        'bio',
        'process',
        'behind',
        'tease',
        'build',
        'first',
        'nothing',
        'empty',
        'yet',
      ],
    ],
    great:
      'For empty Mara Quill: one honest process/tease post path without inventing releases or stats.',
  },
];
