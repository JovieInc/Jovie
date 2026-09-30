import { describe, expect, it } from 'vitest';
import {
  type ContactEvidenceItem,
  deriveContactCertification,
  evidenceDigest,
  evidenceFreshness,
} from '@/lib/contacts/certification';

const NOW = new Date('2026-09-30T00:00:00Z');
const RECENT = '2026-09-29T00:00:00Z';
const OLD = '2026-01-01T00:00:00Z';

const item = (
  overrides: Partial<ContactEvidenceItem>
): ContactEvidenceItem => ({
  key: 'k',
  revision: 'r',
  category: 'dsp',
  label: 'Label',
  value: 'Value',
  url: null,
  source: 'test',
  observedAt: RECENT,
  confidence: 0.95,
  rationale: 'test',
  freshness: 'fresh',
  decision: null,
  ...overrides,
});

const ALL_CLASSES = ['identity', 'dsp', 'catalog', 'search', 'reachability'];

describe('evidenceDigest', () => {
  it('is deterministic and order-sensitive for objects', () => {
    const value = { a: 1, b: [2, 3] };
    expect(evidenceDigest(value)).toBe(evidenceDigest({ ...value }));
    expect(evidenceDigest(value)).not.toBe(evidenceDigest({ a: 1, b: [3, 2] }));
    expect(evidenceDigest(value)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('evidenceFreshness', () => {
  it('returns unknown without an observation', () => {
    expect(evidenceFreshness(null, NOW)).toBe('unknown');
  });
  it('marks observations older than the stale window as stale', () => {
    expect(evidenceFreshness(new Date(OLD), NOW)).toBe('stale');
    expect(evidenceFreshness(new Date(RECENT), NOW)).toBe('fresh');
  });
  it('respects a custom stale window', () => {
    const observed = new Date('2026-09-29T23:00:00Z');
    expect(evidenceFreshness(observed, NOW, 60_000)).toBe('stale');
    expect(evidenceFreshness(observed, NOW, 24 * 60 * 60_000)).toBe('fresh');
  });
});

describe('deriveContactCertification', () => {
  const derive = (
    items: ContactEvidenceItem[],
    over: Partial<Parameters<typeof deriveContactCertification>[0]> = {}
  ) =>
    deriveContactCertification({
      items,
      sourceClassesChecked: ALL_CLASSES,
      requiredSourceClasses: ALL_CLASSES,
      ...over,
    });

  it('reports machine_scanning when there is no evidence', () => {
    const result = derive([]);
    expect(result.status).toBe('machine_scanning');
    expect(result.canCertify).toBe(false);
  });

  it('reports needs_review when required source classes are unchecked with no evidence', () => {
    const result = derive([], { sourceClassesChecked: [] });
    expect(result.status).toBe('needs_review');
    expect(result.coverage.missingSourceClasses).toEqual(ALL_CLASSES);
  });

  it('machine-resolves fresh high-confidence evidence', () => {
    const result = derive([
      item({ key: 'a' }),
      item({ key: 'b', decision: 'yes' }),
    ]);
    expect(result.coverage.confirmed).toBe(2);
    expect(result.coverage.unresolved).toBe(0);
    expect(result.status).toBe('human_reviewed');
    expect(result.canCertify).toBe(true);
  });

  it('keeps low-confidence or undecided evidence unresolved', () => {
    const result = derive([
      item({ key: 'a', confidence: 0.5 }),
      item({ key: 'b', decision: 'no' }),
    ]);
    expect(result.coverage.unresolved).toBe(1);
    expect(result.coverage.rejected).toBe(1);
    expect(result.status).toBe('needs_review');
    expect(result.canCertify).toBe(false);
  });

  it('never machine-resolves conflicts or coverage rows', () => {
    const result = derive([
      item({ key: 'a', category: 'conflicts', confidence: 1 }),
      item({ key: 'b', category: 'coverage', confidence: 1 }),
    ]);
    expect(result.status).toBe('conflicted');
    expect(result.coverage.unresolved).toBe(2);
  });

  it('ignores conflicts the reviewer rejected', () => {
    const result = derive([
      item({ key: 'a', category: 'conflicts', decision: 'no' }),
      item({ key: 'b', decision: 'yes' }),
    ]);
    expect(result.status).toBe('human_reviewed');
    expect(result.canCertify).toBe(true);
  });

  it('reports needs_review when required source classes are unchecked', () => {
    const result = derive([item({ key: 'a', decision: 'yes' })], {
      sourceClassesChecked: ['identity'],
    });
    expect(result.status).toBe('needs_review');
    expect(result.coverage.sourceClassesChecked).toEqual(['identity']);
    expect(result.coverage.missingSourceClasses).toEqual([
      'dsp',
      'catalog',
      'search',
      'reachability',
    ]);
  });

  it('reports stale when any evidence is stale or a prior certification exists', () => {
    const stale = derive([
      item({ key: 'a', freshness: 'stale', decision: 'yes' }),
    ]);
    expect(stale.status).toBe('stale');
    expect(stale.coverage.stale).toBe(1);

    const rechecked = derive([item({ key: 'a', decision: 'yes' })], {
      certifiedRevision: 'older-revision',
    });
    expect(rechecked.status).toBe('stale');
  });

  it('certifies for outreach when the certified revision matches', () => {
    const items = [item({ key: 'a', decision: 'yes' })];
    const first = derive(items);
    expect(first.canCertify).toBe(true);
    const certified = derive(items, {
      certifiedRevision: first.evidenceRevision,
    });
    expect(certified.status).toBe('certified_for_outreach');
  });

  it('rejects certification when unresolved work remains despite matching revision', () => {
    const items = [item({ key: 'a', confidence: 0.5 })];
    const first = derive(items);
    const certified = derive(items, {
      certifiedRevision: first.evidenceRevision,
    });
    expect(certified.canCertify).toBe(false);
    expect(certified.status).toBe('stale');
  });
});
