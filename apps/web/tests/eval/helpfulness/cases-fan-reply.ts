/** Fan-reply draft quota (ASS-42): 8 cases → floor 10 with fan-reply-dm/comment. */
import type { HelpfulnessCase } from './cases';

type Row = readonly [
  id: string,
  ask: string,
  must: readonly (readonly string[])[],
  great: string,
  ci?: true,
];

const ROWS: readonly Row[] = [
  [
    'fan-reply-presave-ask',
    'fan asked for the pre-save link in DMs. draft a reply',
    [['night swim', 'jov.ie', 'lunawaves', 'pre-save', 'presave']],
    'Draft DM with Night Swim pre-save / jov.ie/lunawaves; hold for send.',
  ],
  [
    'fan-reply-merch-ask',
    'someone asked if I have merch. how do I reply?',
    [['merch', 'tip', 'link', 'jov.ie', 'not', "don't", 'no ']],
    'Honest no-merch draft; tip/link ok; hold for send.',
  ],
  [
    'fan-reply-show-ask',
    'fan wants to know when I play Portland. draft something',
    [['portland', 'date', 'tour', 'show', 'tba', 'yet', 'announce']],
    'No invented dates; TBD or tip/link; hold for send.',
  ],
  [
    'fan-reply-mean-comment',
    'someone left a mean comment under Neon Reef. reply or ignore?',
    [['neon reef', 'ignore', 'reply']],
    'Ignore or short non-defensive draft; hold; no pile-on.',
    true,
  ],
  [
    'fan-reply-collab-inbound',
    'a small artist DMed to collab on ambient stuff. draft a reply',
    [['collab', 'ambient', 'draft']],
    'One Luna Waves-voice draft; hold; no auto-accept.',
  ],
  [
    'fan-reply-stream-flex',
    'fan said Night Swim already slapped in their headphones early. reply?',
    [['night swim']],
    'Warm short draft; no inventing streams; hold.',
  ],
  [
    'fan-reply-old-track',
    'fan said Tidal Drift changed their year. what do I say back?',
    [['tidal drift']],
    'Sincere Tidal Drift draft; hold for send.',
  ],
  [
    'fan-reply-link-ask',
    'comment: "link?" on my Night Swim teaser. draft the reply',
    [['night swim', 'jov.ie', 'lunawaves', 'link']],
    'Draft with Night Swim / jov.ie/lunawaves link; hold.',
  ],
];

export const FAN_REPLY_QUOTA_CASES: readonly HelpfulnessCase[] = ROWS.map(
  ([id, ask, mustMentionAny, great, ci]) => ({
    id,
    fixture: 'established' as const,
    ask,
    mustMentionAny,
    great,
    ...(ci ? { ciSubset: true } : {}),
  })
);
