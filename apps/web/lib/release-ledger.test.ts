import { describe, expect, it } from 'vitest';
import {
  classifyLedgerEntry,
  isEmbargoed,
  lintPlainLanguage,
  renderAudienceView,
  summarizeUnderTheHood,
  toReceiptRow,
} from './release-ledger';

const NOW = new Date('2026-10-25T12:00:00Z');
const pr = (number: number, title: string, extra = {}) => ({
  number,
  title,
  ...extra,
});

describe('classifyLedgerEntry', () => {
  it.each([
    ['feat(inbox): show brand deals (JOV-1)', 'feature', 'app'],
    ['fix(billing): retry failed charge', 'fix', 'billing'],
    ['perf(web): trim profile bundle', 'perf', 'app'],
    ['chore(deps): bump zod', 'maintenance', 'dependencies'],
    ['fix(lanes): honour holds', 'fix', 'delivery'],
    ['feat(ovie): read-only Mesh page', 'feature', 'ovie'],
    ['fix(ios): keep sheet open', 'fix', 'mobile'],
    ['refactor(web): split module', 'maintenance', 'app'],
  ])('%s', (title, kind, area) => {
    const entry = classifyLedgerEntry(pr(1, title));
    expect(entry.kind).toBe(kind);
    expect(entry.area).toBe(area);
  });

  it('strips issue ids and type noise from the ops summary', () => {
    expect(
      classifyLedgerEntry(pr(2, 'fix(web): stop double submit (JOV-9)'))
        .opsSummary
    ).toBe('stop double submit');
  });

  it('treats non-conventional titles as maintenance, never a feature', () => {
    expect(classifyLedgerEntry(pr(3, 'Update readme')).kind).toBe(
      'maintenance'
    );
  });
});

describe('embargo', () => {
  const sec = classifyLedgerEntry(
    pr(4, 'fix(security): patch SSRF in importer')
  );
  it('holds security work with no explicit embargo date', () => {
    expect(sec.kind).toBe('security');
    expect(isEmbargoed(sec, NOW)).toBe(true);
  });
  it('holds until the embargo date elapses', () => {
    const future = { ...sec, embargoUntil: '2026-11-01T00:00:00Z' };
    const past = { ...sec, embargoUntil: '2026-10-01T00:00:00Z' };
    expect(isEmbargoed(future, NOW)).toBe(true);
    expect(isEmbargoed(past, NOW)).toBe(false);
  });
  it('an unparseable date stays embargoed', () => {
    expect(isEmbargoed({ ...sec, embargoUntil: 'soon' }, NOW)).toBe(true);
  });
  it('never leaks into customer counts or lines', () => {
    const view = renderAudienceView(
      [pr(4, 'fix(security): patch SSRF in importer')],
      'customer',
      NOW
    );
    expect(view.underTheHood?.total).toBe(0);
    expect(view.underTheHood?.line).toBe('');
    expect(view.withheld).toBe(1);
  });
  it('ops still sees embargoed work', () => {
    const view = renderAudienceView(
      [pr(4, 'fix(security): patch SSRF in importer')],
      'ops',
      NOW
    );
    expect(view.entries).toHaveLength(1);
    expect(view.withheld).toBe(0);
  });
});

describe('audience filter', () => {
  const inputs = [
    pr(10, 'feat(inbox): show brand deals', { storyId: 'brand-deals' }),
    pr(11, 'chore(deps): bump zod'),
    pr(12, 'perf(web): trim profile bundle'),
    pr(13, 'fix(lanes): honour holds'),
  ];
  it('customer view keeps only story-backed entries', () => {
    const view = renderAudienceView(inputs, 'customer', NOW);
    expect(view.entries.map(e => e.number)).toEqual([10]);
    expect(view.groups).toEqual([]);
  });
  it('ops view keeps every entry grouped by area, newest first', () => {
    const view = renderAudienceView(inputs, 'ops', NOW);
    expect(view.entries).toHaveLength(4);
    expect(view.groups.map(g => g.area)).toEqual([
      'app',
      'delivery',
      'dependencies',
    ]);
    expect(view.groups[0]?.entries.map(e => e.number)).toEqual([12, 10]);
  });
});

describe('noise consolidation', () => {
  it('folds non-story work into one plain line with at most three themes', () => {
    const entries = [
      'chore(deps): bump a',
      'chore(ci): tweak',
      'perf(web): faster',
      'fix(web): crash',
      'feat(web): new thing behind a flag',
      'fix(lanes): internal fix',
    ].map((title, i) => classifyLedgerEntry(pr(i + 1, title)));
    const summary = summarizeUnderTheHood(entries, NOW);
    expect(summary.total).toBe(3);
    expect(summary.line.startsWith('Under the hood: ')).toBe(true);
    expect(summary.line.match(/,/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(summary.line.endsWith('.')).toBe(true);
    expect(summary.line).not.toMatch(/#\d|JOV|\d{2,}/);
  });
  it('never mentions tooling or internal-only work', () => {
    const entries = [
      'chore(ci): tweak',
      'fix(lanes): hold',
      'feat(ovie): page',
    ].map((title, i) => classifyLedgerEntry(pr(i + 1, title)));
    const summary = summarizeUnderTheHood(entries, NOW);
    expect(summary).toMatchObject({ total: 0, line: '' });
  });
  it('is empty when every merge became a story', () => {
    const entries = [
      classifyLedgerEntry(pr(1, 'feat(web): x', { storyId: 's' })),
    ];
    expect(summarizeUnderTheHood(entries, NOW).line).toBe('');
  });
  it('receipt rows are compact and carry no title text', () => {
    const row = toReceiptRow(
      classifyLedgerEntry(pr(9, 'fix(web): leaks secret title'))
    );
    expect(JSON.stringify(row)).not.toContain('title');
    expect(row).toMatchObject({ n: 9, k: 'fix' });
  });
});

describe('plain-language lint', () => {
  it('accepts an outcome-first sentence', () => {
    expect(
      lintPlainLanguage(
        'You can now reconnect Google without losing your place.'
      )
    ).toEqual([]);
  });
  it.each([
    [
      'Refactor the inbox middleware (JOV-12)',
      ['jargon', 'internal-reference', 'outcome-first'],
    ],
    ['Fixed various things', ['vague', 'outcome-first']],
    ['Set `feature_flag` for rollout', ['code-token']],
    ['x'.repeat(250), ['length']],
  ])('flags %s', (text, rules) => {
    const found = lintPlainLanguage(text).map(v => v.rule);
    for (const rule of rules) expect(found).toContain(rule);
  });
  it('rejects empty text', () => {
    expect(lintPlainLanguage('  ')[0]?.rule).toBe('empty');
  });
});
