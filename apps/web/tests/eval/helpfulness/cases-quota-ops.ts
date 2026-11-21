/**
 * ASS-12 quota fill: stalled follow-ups, approvals, memory, routines.
 */

import type { HelpfulnessCase } from './case-types';

export const QUOTA_OPS_CASES: readonly HelpfulnessCase[] = [
  {
    id: 'stalled-release-no-plan',
    fixture: 'established',
    ask: 'Night Swim is days out and I still have no promo plan. unblock me',
    mustMentionAny: [['night swim']],
    great:
      'Treats as stalled release: one unblock plan for Night Swim today, not a brainstorm.',
  },
  {
    id: 'stalled-presave-flat',
    fixture: 'established',
    ask: 'pre-saves for Night Swim are flat. what is the one move?',
    mustMentionAny: [['night swim']],
    great:
      'One concrete unblock (IG bio / top link) using Instagram traffic fact; no invented pre-save counts.',
  },
  {
    id: 'stalled-dm-silence',
    fixture: 'established',
    ask: 'I asked three playlist pages for Night Swim and got silence',
    mustMentionAny: [['night swim']],
    great:
      'One next step: nudge draft held for yes, or switch lane; never sends unasked.',
  },
  {
    id: 'stalled-neon-post-decay',
    fixture: 'established',
    ask: 'Neon Reef posts are not getting love anymore',
    mustMentionAny: [['neon reef', 'night swim']],
    great:
      'Names post-release decay as normal for ~58-day Neon Reef; one divert to Night Swim or one revive move.',
  },
  {
    id: 'stalled-tip-link',
    fixture: 'established',
    ask: 'tip link clicks happened but tips stalled this month',
    mustMentionAny: [['tip', '25', '19', '150']],
    great:
      'Uses $25 this month / 19% conversion context; one unblock; no invented processor errors.',
  },
  {
    id: 'stalled-lapsed-visits',
    fixture: 'lapsed',
    ask: 'profile visits keep falling. what is stalled?',
    mustMentionAny: [['visit', 'low tide', '38', '610']],
    great:
      'Uses Harbor Static -38% visits insight; one restart move tied to Low Tide Choir.',
  },
  {
    id: 'stalled-collab-second',
    fixture: 'established',
    history: [
      {
        role: 'user',
        text: 'River Lantern still has not answered the Night Swim remix ask',
      },
      {
        role: 'assistant',
        text: 'River Lantern Night Swim remix outreach remains unanswered ~30 days.',
      },
    ],
    ask: 'second collab email to River Lantern still unanswered after a month',
    mustMentionAny: [['river lantern', 'night swim', 'drop', 'nudge', 'final']],
    great:
      'Picks drop vs final nudge with Night Swim timing reason; draft-hold only.',
  },
  {
    id: 'approvals-count-two',
    fixture: 'established',
    history: [
      {
        role: 'assistant',
        text: 'Two drafts held for your yes: (1) Night Swim Stories countdown, (2) Ambient Evening pitch.',
      },
    ],
    ask: 'how many drafts are waiting on me?',
    mustMentionAny: [
      ['2', 'two'],
      ['draft', 'yes', 'approval'],
    ],
    great:
      'Leads with count (2) and names both drafts; one-tap yes framing; does not send.',
  },
  {
    id: 'approvals-approve-one',
    fixture: 'established',
    history: [
      {
        role: 'assistant',
        text: 'Waiting on your yes: Night Swim caption, and curator pitch. Neither sent.',
      },
    ],
    ask: 'yes on the caption only',
    mustMentionAny: [['caption'], ['pitch', 'hold', 'still', 'other']],
    great:
      'Approves only the caption draft, leaves the other held; does not invent a send of the pitch.',
  },
  {
    id: 'approvals-what-changes',
    fixture: 'established',
    history: [
      {
        role: 'assistant',
        text: 'Draft pitch for Night Swim -> Ambient Evening is held. Yes sends that text only.',
      },
    ],
    ask: 'if I tap yes on the pitch, what exactly goes out?',
    mustMentionAny: [['night swim'], ['ambient evening', 'pitch']],
    great:
      'Restates the exact draft/destination before send; requires confirm; no silent submit.',
  },
  {
    id: 'approvals-reject-all',
    fixture: 'established',
    history: [
      {
        role: 'assistant',
        text: '3 drafts pending your yes: caption, pitch, fan reply.',
      },
    ],
    ask: 'nope, scrap every pending draft',
    mustMentionAny: [
      ['scrap', 'clear', 'discard', 'removed', 'gone', 'canceled', 'cancelled'],
    ],
    great: 'Clears pending drafts without sending; confirms count cleared.',
  },
  {
    id: 'approvals-one-tap-frame',
    fixture: 'established',
    ask: 'make approval stupid simple for the Night Swim caption',
    mustMentionAny: [['night swim'], ['yes', 'approve', 'tap']],
    great:
      'Frames one-tap yes/no for the single Night Swim caption draft; does not post it.',
  },
  {
    id: 'memory-read-genre',
    fixture: 'established',
    ask: 'what do you think my sound is?',
    mustMentionAny: [['ambient', 'electronic', 'downtempo']],
    great:
      'Reads ambient/electronic/downtempo from profile; does not invent a different brand.',
  },
  {
    id: 'memory-read-city',
    fixture: 'established',
    ask: 'where did you store that I am based?',
    mustMentionAny: [['portland']],
    great: 'Portland from bio/profile; treats profile as SoT over chat memory.',
  },
  {
    id: 'memory-correct-followers',
    fixture: 'established',
    history: [
      {
        role: 'assistant',
        text: 'With your 20k followers you can lean on playlist momentum.',
      },
    ],
    ask: 'stop saying I have 20k followers - fix that',
    mustMentionAny: [['12,500', '12.5k', '12500']],
    great:
      'Corrects to 12,500 from fixture; does not keep the wrong memory as SoT.',
  },
  {
    id: 'memory-forget-collab',
    fixture: 'established',
    history: [
      {
        role: 'user',
        text: 'remind me to keep chasing River Lantern for a Night Swim remix',
      },
      {
        role: 'assistant',
        text: 'Noted - keep River Lantern Night Swim remix on the follow-up list.',
      },
    ],
    ask: 'forget the River Lantern remix idea entirely',
    mustMentionAny: [['forget', 'forgotten', 'removed', 'cleared', 'drop']],
    great:
      'Confirms that collab thread is forgotten for future suggestions; no invented other memories.',
  },
  {
    id: 'routine-run-saved',
    fixture: 'established',
    history: [
      {
        role: 'assistant',
        text: 'Saved routine "Single launch": pre-save -> bio swap -> release caption -> curator pitch.',
      },
    ],
    ask: 'run my Single launch routine for Night Swim',
    mustMentionAny: [
      ['night swim'],
      ['routine', 'pre-save', 'presave', 'bio', 'caption', 'pitch'],
    ],
    great:
      'Runs or walks the saved Single launch steps applied to Night Swim; asks before any send.',
  },
  {
    id: 'routine-rename',
    fixture: 'established',
    history: [
      {
        role: 'assistant',
        text: 'Saved routine "Single launch": pre-save -> bio swap -> release caption.',
      },
    ],
    ask: 'rename that routine to Friday Drop Kit',
    mustMentionAny: [['friday drop kit', 'rename', 'renamed']],
    great: 'Renames the saved routine and confirms the new title once.',
  },
  {
    id: 'routine-add-step',
    fixture: 'established',
    history: [
      {
        role: 'assistant',
        text: 'Saved routine "Single launch": pre-save -> bio swap -> release caption.',
      },
    ],
    ask: 'add a tip-link reminder to the launch routine',
    mustMentionAny: [['tip'], ['routine']],
    great: 'Adds tip-link step to the saved routine and restates steps once.',
  },
  {
    id: 'routine-new-artist',
    fixture: 'new',
    ask: 'save a first-release checklist I can reuse when I finally drop',
    mustMentionAny: [['routine', 'checklist', 'playbook', 'template', 'save']],
    great:
      'Proposes a do-it-once first-release routine for Mara Quill without inventing catalog.',
  },
];
