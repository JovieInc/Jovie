import { describe, expect, it } from 'vitest';
import {
  type CopyText,
  classifyEdit,
  type EditPair,
  evaluateAutoApprove,
  evaluateDrafter,
  isHeldOut,
  mineStyleGuide,
  normalizedEditDistance,
  percentile,
  redactCopy,
  selectFewShot,
  summarizeSegment,
  wordEditDistance,
} from './edit-learning';

const T0 = new Date('2026-10-01T00:00:00Z').getTime();
const DRAFT: CopyText = {
  subject: 'Low Tide',
  body: 'Hey,\n\nI made a page for Low Tide. It sends people to whichever app they already use.\n\n{claimLink}\n\nTim',
};

function pair(i: number, overrides: Partial<EditPair> = {}): EditPair {
  return {
    leadId: `lead-${i}`,
    segment: 'email:recent_release',
    templateVersion: 'cold-draft/v1',
    decision: 'approved',
    before: DRAFT,
    after: DRAFT,
    rejectReason: null,
    at: new Date(T0 + i * 60_000),
    ...overrides,
  };
}

const healthy = { sent: 200, bounceRate: 0.005, complaintRate: 0 };

describe('distance and categories', () => {
  it('measures word edits', () => {
    expect(wordEditDistance('a b c', 'a b c')).toBe(0);
    expect(wordEditDistance('a b c', 'a x c')).toBe(1);
    expect(wordEditDistance('', 'a b')).toBe(2);
  });

  it('scores unchanged approvals 0 and rejects 1', () => {
    expect(normalizedEditDistance(pair(1))).toBe(0);
    expect(
      normalizedEditDistance(pair(1, { decision: 'rejected', after: null }))
    ).toBe(1);
  });

  it('names what changed', () => {
    expect(classifyEdit(DRAFT, DRAFT)).toEqual(['unchanged']);
    expect(
      classifyEdit(DRAFT, { ...DRAFT, subject: 'made you a page' })
    ).toContain('subject');
    expect(
      classifyEdit(DRAFT, {
        ...DRAFT,
        body: 'Hey,\n\nMade you a page for Low Tide.\n\n{claimLink}\n\nTim',
      })
    ).toContain('cut');
    expect(
      classifyEdit(DRAFT, { ...DRAFT, body: DRAFT.body.replace('Tim', 'T') })
    ).toContain('signoff');
  });
});

describe('redactCopy', () => {
  it('strips the name and claim link before a pair is stored', () => {
    const out = redactCopy(
      {
        subject: 'Nova Lane page',
        body: 'Hey Nova Lane, https://jov.ie/claim/agent/abc-123 Tim',
      },
      { names: ['Nova Lane'], claimUrl: null }
    );
    expect(out.subject).toBe('{name} page');
    expect(out.body).toBe('Hey {name}, {claimLink} Tim');
  });
});

describe('summarizeSegment', () => {
  it('reports unchanged rate, p50/p95 and reject reasons on the newest template', () => {
    const pairs = [
      ...Array.from({ length: 8 }, (_, i) => pair(i)),
      pair(8, { after: { ...DRAFT, subject: 'made you a page' } }),
      pair(9, { decision: 'rejected', after: null, rejectReason: 'too_big' }),
      pair(-1, {
        templateVersion: 'cold-draft/v0',
        decision: 'rejected',
        after: null,
      }),
    ];
    const summary = summarizeSegment(pairs, 'email:recent_release');
    expect(summary.templateVersion).toBe('cold-draft/v1');
    expect(summary.reviewed).toBe(10);
    expect(summary.approvedUnchanged).toBe(8);
    expect(summary.unchangedRate).toBe(0.8);
    expect(summary.editDistanceP50).toBe(0);
    expect(summary.editDistanceP95).toBe(1);
    expect(summary.rejectReasons).toEqual({ too_big: 1 });
  });

  it('percentile uses nearest rank', () => {
    expect(percentile([0, 0, 0, 1], 50)).toBe(0);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('evaluateAutoApprove', () => {
  const clean = (n: number) => Array.from({ length: n }, (_, i) => pair(i));

  it('stays in review below N reviews', () => {
    const verdict = evaluateAutoApprove({
      learning: summarizeSegment(clean(49), 'email:recent_release'),
      health: healthy,
      killSwitch: false,
      currentTemplateVersion: 'cold-draft/v1',
    });
    expect(verdict.mode).toBe('review');
    expect(verdict.blocks).toContain('too_few_reviews');
  });

  it('turns on at N clean reviews with healthy deliverability', () => {
    const verdict = evaluateAutoApprove({
      learning: summarizeSegment(clean(50), 'email:recent_release'),
      health: healthy,
      killSwitch: false,
      currentTemplateVersion: 'cold-draft/v1',
    });
    expect(verdict).toMatchObject({ mode: 'auto', blocks: [] });
  });

  it('tolerates under 5% edits but drops back when edits creep above p95', () => {
    const two = [
      ...clean(48),
      pair(100, { decision: 'rejected', after: null }),
      pair(101, { after: { ...DRAFT, subject: 'x' } }),
    ];
    expect(
      evaluateAutoApprove({
        learning: summarizeSegment(two, 'email:recent_release'),
        health: healthy,
        killSwitch: false,
        currentTemplateVersion: 'cold-draft/v1',
      }).mode
    ).toBe('auto');
    const four = [
      ...two,
      pair(102, { decision: 'rejected', after: null }),
      pair(103, { decision: 'rejected', after: null }),
    ];
    expect(
      evaluateAutoApprove({
        learning: summarizeSegment(four, 'email:recent_release'),
        health: healthy,
        killSwitch: false,
        currentTemplateVersion: 'cold-draft/v1',
      }).blocks
    ).toContain('edits_requested');
  });

  it('drops back on complaints, bounces, a new template or the kill switch', () => {
    const learning = summarizeSegment(clean(60), 'email:recent_release');
    const base = {
      learning,
      killSwitch: false,
      currentTemplateVersion: 'cold-draft/v1',
    };
    expect(
      evaluateAutoApprove({
        ...base,
        health: { ...healthy, complaintRate: 0.002 },
      }).blocks
    ).toContain('complaints_high');
    expect(
      evaluateAutoApprove({
        ...base,
        health: { ...healthy, bounceRate: 0.025 },
      }).blocks
    ).toContain('bounce_high');
    expect(
      evaluateAutoApprove({
        ...base,
        health: { sent: 0, bounceRate: null, complaintRate: null },
      }).blocks
    ).toContain('deliverability_unknown');
    expect(
      evaluateAutoApprove({
        ...base,
        health: healthy,
        currentTemplateVersion: 'cold-draft/v2',
      }).blocks
    ).toContain('template_changed');
    expect(
      evaluateAutoApprove({ ...base, health: healthy, killSwitch: true }).blocks
    ).toContain('kill_switch');
  });
});

describe('style guide, few-shot and held-out eval', () => {
  const edited = (i: number) =>
    pair(i, {
      after: {
        ...DRAFT,
        body: DRAFT.body.replace(
          ' It sends people to whichever app they already use.',
          ''
        ),
      },
    });

  it('mines phrases Tim keeps removing', () => {
    const guide = mineStyleGuide([edited(1), edited(2), edited(3)]);
    expect(guide.basedOn).toBe(3);
    expect(guide.avoid.map(entry => entry.phrase)).toContain('whichever app');
  });

  it('splits held-out leads deterministically', () => {
    expect(isHeldOut('lead-42')).toBe(isHeldOut('lead-42'));
    const share =
      Array.from({ length: 1000 }, (_, i) => isHeldOut(`l${i}`)).filter(Boolean)
        .length / 1000;
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.28);
  });

  it('picks few-shot examples only from edited, non-held-out approvals', () => {
    const pairs = Array.from({ length: 40 }, (_, i) => edited(i));
    const shots = selectFewShot(pairs, 4);
    expect(shots).toHaveLength(4);
    for (const shot of shots) expect(isHeldOut(shot.leadId)).toBe(false);
  });

  it('scores a drafter against what Tim approved on held-out leads', () => {
    const pairs = Array.from({ length: 200 }, (_, i) => edited(i));
    const perfect = evaluateDrafter(pairs, p => p.after as CopyText);
    expect(perfect.n).toBeGreaterThan(0);
    expect(perfect.meanDistance).toBe(0);
    const original = evaluateDrafter(pairs, p => p.before);
    expect(original.meanDistance).toBeGreaterThan(0);
  });
});
