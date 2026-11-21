/**
 * Hermetic CI ratchet for residual ASS-16 one-rec gaps beyond #26382 / #26390.
 *
 * Uses calibration deliberate-red replies + good fixtures. No model spend.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import calibration from './calibration.json';
import { HELPFULNESS_CASES } from './cases';
import {
  draftsOneCollabTarget,
  firstContentSentence,
  isPlanningMenuCloser,
  runOneRecGapChecks,
  upcomingInFirstSentenceWithDays,
} from './one-rec-gaps';
import { runHardChecks, scoreCase } from './scoring';

function calibrationReply(id: string): string {
  const example = calibration.examples.find(e => e.id === id);
  if (!example) throw new Error(`missing calibration example: ${id}`);
  return example.reply.text;
}

function calibrationTools(
  id: string
): readonly { readonly name: string; readonly input: unknown }[] {
  const example = calibration.examples.find(e => e.id === id);
  if (!example) throw new Error(`missing calibration example: ${id}`);
  const calls = example.reply.toolCalls ?? [];
  return calls.map(call => ({
    name: call.name,
    input: call.input ?? {},
  }));
}

describe('one-rec gaps: upcoming first sentence + days-left', () => {
  it.each(['greeting', 'presave', 'whats-next-release'] as const)(
    'fails %s deliberate-red (title and/or days-left missing from first sentence)',
    id => {
      const text = calibrationReply(id);
      expect(
        upcomingInFirstSentenceWithDays(text, 'Night Swim'),
        `opener: ${firstContentSentence(text)}`
      ).toBe(false);
      expect(
        runOneRecGapChecks(text, { upcomingTitle: 'Night Swim' }).find(
          c => c.id === 'upcoming-sentence-days'
        )?.ok
      ).toBe(false);
    }
  );

  it('passes a greeting/presave/whats-next opener that leads with title + days-left', () => {
    const text =
      'Night Swim is out tomorrow. Put the pre-save at the top of jov.ie/lunawaves today and swap your Instagram bio to it.';
    expect(upcomingInFirstSentenceWithDays(text, 'Night Swim')).toBe(true);
    expect(
      runOneRecGapChecks(text, { upcomingTitle: 'Night Swim' }).every(c => c.ok)
    ).toBe(true);
  });

  it('fails whats-next-release even when the title appears without a days-left cue', () => {
    // #26382 upcoming-first (160-char window) would pass this shape; ASS-16
    // still needs tomorrow/days in the first content sentence.
    const text = calibrationReply('whats-next-release');
    expect(firstContentSentence(text).toLowerCase()).toContain('night swim');
    expect(upcomingInFirstSentenceWithDays(text, 'Night Swim')).toBe(false);
  });
});

describe('one-rec gaps: planning-menu closer', () => {
  it('fails the whats-next-release menu closer #26382 patterns miss', () => {
    const text = calibrationReply('whats-next-release');
    expect(isPlanningMenuCloser(text)).toBe(true);
    expect(
      runOneRecGapChecks(text, { upcomingTitle: 'Night Swim' }).find(
        c => c.id === 'planning-menu-not-a-move'
      )?.ok
    ).toBe(false);
  });

  it('passes a dated single move without a multi-option menu', () => {
    const text =
      'Night Swim is out Friday, in 2 days. One move: put the pre-save at the top of jov.ie/lunawaves today.';
    expect(isPlanningMenuCloser(text)).toBe(false);
  });
});

describe('one-rec gaps: collab draft one target', () => {
  it('fails the collab deliberate-red that lists two artists and asks for a pick', () => {
    const text = calibrationReply('collab');
    expect(draftsOneCollabTarget(text)).toBe(false);
    expect(
      runOneRecGapChecks(text, { requireCollabDraftOne: true }).find(
        c => c.id === 'collab-draft-one'
      )?.ok
    ).toBe(false);
  });

  it('passes a reply that drafts one concrete collab target', () => {
    const text =
      'Night Swim is out tomorrow, so draft outreach for Fictional Artist A today — shared ambient playlist overlap makes the ask concrete. Holding the draft for your one-tap yes before send.';
    expect(draftsOneCollabTarget(text)).toBe(true);
    expect(
      runOneRecGapChecks(text, { requireCollabDraftOne: true }).every(c => c.ok)
    ).toBe(true);
  });
});

describe('one-rec gaps: followup-do-it calls tool', () => {
  const followup = HELPFULNESS_CASES.find(c => c.id === 'followup-do-it');

  it('fails calibration followup-do-it with empty toolCalls (expected_tool + gap theme)', () => {
    if (!followup) throw new Error('missing followup-do-it');
    const text = calibrationReply('followup-do-it');
    const toolCalls = calibrationTools('followup-do-it');
    expect(toolCalls).toEqual([]);

    const gap = runOneRecGapChecks(text, {
      expectedTool: 'generateReleasePitch',
      toolCalls,
    });
    expect(gap.find(c => c.id === 'do-it-calls-tool')?.ok).toBe(false);

    const checks = runHardChecks(followup, { text, toolCalls: [] });
    expect(checks.find(c => c.id === 'expected_tool')?.ok).toBe(false);
    expect(scoreCase(followup.id, checks, null).passed).toBe(false);
  });

  it('passes when generateReleasePitch is called for the do-it turn', () => {
    if (!followup) throw new Error('missing followup-do-it');
    const text =
      'Drafting the Night Swim curator pitch now and holding it for your one-tap yes before anything sends.';
    const toolCalls = [
      {
        name: 'generateReleasePitch',
        input: { releaseTitle: 'Night Swim' },
      },
    ];

    expect(
      runOneRecGapChecks(text, {
        expectedTool: 'generateReleasePitch',
        toolCalls,
      }).every(c => c.ok)
    ).toBe(true);

    const checks = runHardChecks(followup, { text, toolCalls });
    expect(checks.find(c => c.id === 'expected_tool')?.ok).toBe(true);
  });
});

describe('one-rec gaps: calibration coverage map', () => {
  it('flags residual reds without claiming #26382 / #26390 themes', () => {
    const upcomingReds = calibration.examples.filter(
      example =>
        !upcomingInFirstSentenceWithDays(example.reply.text, 'Night Swim') &&
        ['greeting', 'presave', 'whats-next-release'].includes(example.id)
    );
    expect(upcomingReds.map(e => e.id).sort()).toEqual([
      'greeting',
      'presave',
      'whats-next-release',
    ]);

    const menuReds = calibration.examples.filter(example =>
      isPlanningMenuCloser(example.reply.text)
    );
    expect(menuReds.map(e => e.id)).toEqual(['whats-next-release']);

    const collabReds = calibration.examples.filter(
      example =>
        example.id === 'collab' && !draftsOneCollabTarget(example.reply.text)
    );
    expect(collabReds.map(e => e.id)).toEqual(['collab']);
  });
});
