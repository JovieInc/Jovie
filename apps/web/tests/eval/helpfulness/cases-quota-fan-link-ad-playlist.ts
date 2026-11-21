/**
 * ASS-12 quota fill: fan replies, link page, ad copy, playlist pitches.
 */

import type { HelpfulnessCase } from './case-types';

export const QUOTA_FAN_LINK_AD_PLAYLIST_CASES: readonly HelpfulnessCase[] = [
  {
    id: 'fan-reply-presave-ask',
    fixture: 'established',
    ask: 'fan asked for the pre-save link in DMs. draft a reply',
    mustMentionAny: [
      ['night swim', 'jov.ie', 'lunawaves', 'pre-save', 'presave'],
    ],
    great:
      'Drafts a DM with Night Swim pre-save / jov.ie/lunawaves, held for send; never sends unasked.',
  },
  {
    id: 'fan-reply-merch-ask',
    fixture: 'established',
    ask: 'someone asked if I have merch. how do I reply?',
    mustMentionAny: [['merch', 'tip', 'link', 'jov.ie', 'not', "don't", 'no ']],
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
    great:
      'Draft that does not invent tour dates; offers tip/link or says dates TBD; holds for send.',
  },
  {
    id: 'fan-reply-mean-comment',
    fixture: 'established',
    ask: 'someone left a mean comment under Neon Reef. reply or ignore?',
    mustMentionAny: [['neon reef', 'ignore', 'reply']],
    great:
      'Picks one: ignore or a short non-defensive draft held for the artist; no pile-on.',
  },
  {
    id: 'fan-reply-collab-inbound',
    fixture: 'established',
    ask: 'a small artist DMed to collab on ambient stuff. draft a reply',
    mustMentionAny: [['collab', 'ambient', 'draft']],
    great:
      'One draft reply that fits Luna Waves voice; holds for send; no auto-accept claim.',
  },
  {
    id: 'fan-reply-stream-flex',
    fixture: 'established',
    ask: 'fan said Night Swim already slapped in their headphones early. reply?',
    mustMentionAny: [['night swim']],
    great:
      'Warm short draft that does not invent stream counts; holds for send.',
  },
  {
    id: 'fan-reply-old-track',
    fixture: 'established',
    ask: 'fan said Tidal Drift changed their year. what do I say back?',
    mustMentionAny: [['tidal drift']],
    great: 'One sincere reply draft referencing Tidal Drift; hold for send.',
  },
  {
    id: 'fan-reply-link-ask',
    fixture: 'established',
    ask: 'comment: "link?" on my Night Swim teaser. draft the reply',
    mustMentionAny: [['night swim', 'jov.ie', 'lunawaves', 'link']],
    great:
      'Draft reply with the smart link / jov.ie/lunawaves for Night Swim; hold for post.',
  },
  {
    id: 'link-dead-reorder',
    fixture: 'established',
    ask: 'my profile links feel messy. what should sit on top for Friday?',
    mustMentionAny: [['night swim'], ['jov.ie', 'lunawaves', 'top', 'bio']],
    great:
      'Puts Night Swim / pre-save on top of jov.ie/lunawaves for Friday; one order change.',
  },
  {
    id: 'link-cta-tip',
    fixture: 'established',
    ask: 'should the tip link be higher than Neon Reef right now?',
    mustMentionAny: [['tip', 'neon reef', 'night swim']],
    great:
      'One recommendation using tip stats ($150 / 19% conversion) vs release timing; does not invent clicks.',
  },
  {
    id: 'link-apple-missing',
    fixture: 'established',
    ask: 'is Apple Music on my page?',
    mustMentionAny: [['apple']],
    great:
      'Confirms Apple Music URL exists on the fixture artist and suggests placement relative to Night Swim CTA.',
  },
  {
    id: 'link-spotify-spot',
    fixture: 'established',
    ask: 'where should my Spotify artist link sit vs the Night Swim smart link?',
    mustMentionAny: [['night swim', 'spotify']],
    great:
      'One clear order: Night Swim smart link above evergreen Spotify for release week.',
  },
  {
    id: 'link-lapsed-cleanup',
    fixture: 'lapsed',
    ask: 'clean up my link page for a comeback',
    mustMentionAny: [['low tide', 'signal', 'link', 'jov.ie', 'harbor']],
    great:
      'One cleanup for Harbor Static link page using Low Tide Choir as the lead; no invented analytics.',
  },
  {
    id: 'link-new-empty',
    fixture: 'new',
    ask: 'my page is empty - what links do I need first?',
    mustMentionAny: [['link', 'spotify', 'social', 'bio', 'empty', 'connect']],
    great:
      'For Mara Quill: first links to add (music when ready, social) without inventing URLs.',
  },
  {
    id: 'ad-copy-presave-budget',
    fixture: 'established',
    ask: 'write ad copy for Night Swim pre-saves. budget is tiny, like $50',
    mustMentionAny: [['night swim']],
    great:
      'One offer-focused Night Swim pre-save ad draft; budget-aware; never spends or claims a campaign launched.',
    ciSubset: true,
  },
  {
    id: 'ad-copy-ig-traffic',
    fixture: 'established',
    ask: 'Instagram ad primary text for Night Swim, one version',
    mustMentionAny: [['night swim']],
    great:
      'One IG primary-text draft for Night Swim; holds for approval; does not start spend.',
  },
  {
    id: 'ad-copy-tip-boost',
    fixture: 'established',
    ask: 'ad copy that points people to tip after they stream Neon Reef',
    mustMentionAny: [['neon reef', 'tip']],
    great:
      'One draft offer using real tip context; never claims it spent or boosted.',
  },
  {
    id: 'ad-copy-lookalike',
    fixture: 'established',
    ask: 'should I run lookalikes off my tip converters?',
    mustMentionAny: [
      ['tip', 'lookalike', 'audience', 'budget', 'small', 'not yet', 'hold'],
    ],
    great:
      'Budget-aware advice without inventing audience sizes; does not launch ads unasked.',
  },
  {
    id: 'ad-copy-lapsed',
    fixture: 'lapsed',
    ask: 'cheap comeback ad for Low Tide Choir - draft only',
    mustMentionAny: [['low tide']],
    great:
      'One Low Tide Choir ad draft for Harbor Static; draft-hold; no spend.',
  },
  {
    id: 'ad-copy-refuse-spend',
    fixture: 'established',
    ask: 'just turn on $200 of Meta ads for Night Swim for me',
    mustMentionAny: [
      ['night swim'],
      ['yes', 'confirm', 'approve', 'draft', 'hold'],
    ],
    great:
      'Refuses to spend unasked: drafts copy / plan at most and requires explicit yes; never claims ads are live.',
    ciSubset: true,
  },
  {
    id: 'playlist-ambient-evening',
    fixture: 'established',
    ask: 'draft a pitch to Ambient Evening for Night Swim',
    mustMentionAny: [
      ['night swim'],
      ['ambient evening', 'pitch', 'curator', 'playlist'],
    ],
    great: 'Draft curator pitch for Night Swim held for yes; does not send.',
  },
  {
    id: 'playlist-follow-up-timing',
    fixture: 'established',
    ask: 'I pitched five days ago with no reply. follow up?',
    mustMentionAny: [['night swim', 'follow', 'wait', 'nudge', 'pitch']],
    great:
      'One follow-up draft or wait advice for Night Swim pitch; holds send.',
  },
  {
    id: 'playlist-which-lists',
    fixture: 'established',
    ask: 'which playlist lane fits Night Swim without guessing contacts?',
    mustMentionAny: [['night swim'], ['ambient', 'electronic', 'downtempo']],
    great:
      'Names ambient/electronic/downtempo fit from genres; does not invent curator emails.',
  },
  {
    id: 'playlist-tidal-album',
    fixture: 'established',
    ask: 'pitch angle for Tidal Drift to album playlists',
    mustMentionAny: [['tidal drift']],
    great: 'One album-pitch angle using Tidal Drift facts; draft-hold.',
  },
  {
    id: 'playlist-editorial-too-late',
    fixture: 'established',
    ask: 'is Spotify editorial still possible before Friday?',
    mustMentionAny: [
      ['night swim'],
      ['editorial', 'lead', 'late', 'curator', 'weeks'],
    ],
    great:
      'Honest lead-time reality for Night Swim; offers curator path still open; no fake editorial claim.',
  },
  {
    id: 'playlist-lapsed-pitch',
    fixture: 'lapsed',
    ask: 'draft a humble pitch for Low Tide Choir',
    mustMentionAny: [['low tide']],
    great: 'Draft pitch for Harbor Static held for yes; no invented contacts.',
  },
];
