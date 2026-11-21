/**
 * Fan-reply draft quota fill (ASS-42): draft-hold replies only — never send.
 * Complements fan-reply-dm / fan-reply-comment in cases.ts toward the 10-case floor.
 */

import type { HelpfulnessCase } from './cases';

export const FAN_REPLY_QUOTA_CASES: readonly HelpfulnessCase[] = [
  {
    id: 'fan-reply-presave-ask',
    fixture: 'established',
    ask: 'fan asked for the pre-save link in DMs. draft a reply',
    mustMentionAny: [
      ['night swim', 'jov.ie', 'lunawaves', 'pre-save', 'presave'],
    ],
    draftHold: true,
    great:
      'Drafts a DM with Night Swim pre-save / jov.ie/lunawaves, held for send; never sends unasked.',
  },
  {
    id: 'fan-reply-merch-ask',
    fixture: 'established',
    ask: 'someone asked if I have merch. how do I reply?',
    mustMentionAny: [['merch', 'tip', 'link', 'jov.ie', 'not', "don't", 'no ']],
    draftHold: true,
    great:
      'Honest draft: no invented merch store; points to tip/link page if relevant; holds for send.',
  },
  {
    id: 'fan-reply-show-ask',
    fixture: 'established',
    ask: 'fan wants to know when I play Portland. draft something',
    mustMentionAny: [
      ['portland', 'date', 'tour', 'show', 'tba', 'yet', 'announce'],
    ],
    draftHold: true,
    great:
      'Draft that does not invent tour dates; offers tip/link or says dates TBD; holds for send.',
  },
  {
    id: 'fan-reply-mean-comment',
    fixture: 'established',
    ask: 'someone left a mean comment under Neon Reef. reply or ignore?',
    mustMentionAny: [['neon reef', 'ignore', 'reply']],
    draftHold: true,
    great:
      'Picks one: ignore or a short non-defensive draft held for the artist; no pile-on.',
    ciSubset: true,
  },
  {
    id: 'fan-reply-collab-inbound',
    fixture: 'established',
    ask: 'a small artist DMed to collab on ambient stuff. draft a reply',
    mustMentionAny: [['collab', 'ambient', 'draft']],
    draftHold: true,
    great:
      'One draft reply that fits Luna Waves voice; holds for send; no auto-accept claim.',
  },
  {
    id: 'fan-reply-stream-flex',
    fixture: 'established',
    ask: 'fan said Night Swim already slapped in their headphones early. reply?',
    mustMentionAny: [['night swim']],
    draftHold: true,
    great:
      'Warm short draft that does not invent stream counts; holds for send.',
  },
  {
    id: 'fan-reply-old-track',
    fixture: 'established',
    ask: 'fan said Tidal Drift changed their year. what do I say back?',
    mustMentionAny: [['tidal drift']],
    draftHold: true,
    great: 'One sincere reply draft referencing Tidal Drift; hold for send.',
  },
  {
    id: 'fan-reply-link-ask',
    fixture: 'established',
    ask: 'comment: "link?" on my Night Swim teaser. draft the reply',
    mustMentionAny: [['night swim', 'jov.ie', 'lunawaves', 'link']],
    draftHold: true,
    great:
      'Draft reply with the smart link / jov.ie/lunawaves for Night Swim; hold for post.',
  },
];
