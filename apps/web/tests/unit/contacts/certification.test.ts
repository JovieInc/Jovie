// biome-ignore-all format: compact state matrix keeps every certification branch below the hard PR cap.
import { describe, expect, it } from 'vitest';
import { type ContactEvidenceItem, deriveContactCertification, evidenceDigest, evidenceFreshness } from '@/lib/contacts/certification';

const NOW = new Date('2026-09-30T00:00:00Z');
const CLASSES = ['identity', 'dsp', 'catalog', 'search', 'reachability'];
const item = (over: Partial<ContactEvidenceItem> = {}): ContactEvidenceItem => ({ key: 'k', revision: 'r', category: 'dsp', label: 'Label', value: 'Value', url: null, source: 'test', observedAt: '2026-09-29T00:00:00Z', confidence: 0.95, rationale: 'test', freshness: 'fresh', decision: null, ...over });
const derive = (items: ContactEvidenceItem[], over: Partial<Parameters<typeof deriveContactCertification>[0]> = {}) => deriveContactCertification({ items, sourceClassesChecked: CLASSES, requiredSourceClasses: CLASSES, ...over });

describe('contact certification derivation', () => {
  it('hashes exact evidence and classifies observation freshness', () => {
    const value = { a: 1, b: [2, 3] };
    expect(evidenceDigest(value)).toMatch(/^[0-9a-f]{64}$/);
    expect(evidenceDigest(value)).not.toBe(evidenceDigest({ a: 1, b: [3, 2] }));
    expect([evidenceFreshness(null, NOW), evidenceFreshness(new Date('2026-01-01'), NOW), evidenceFreshness(new Date('2026-09-29'), NOW)]).toEqual(['unknown', 'stale', 'fresh']);
  });

  it.each([['machine scanning', [], {}, { status: 'machine_scanning', canCertify: false }], ['missing coverage', [], { sourceClassesChecked: [] }, { status: 'needs_review', coverage: { missingSourceClasses: CLASSES } }], ['machine and human confirmation', [item({ key: 'a' }), item({ key: 'b', decision: 'yes' })], {}, { status: 'human_reviewed', canCertify: true, coverage: { confirmed: 2, unresolved: 0 } }], ['low confidence and rejection', [item({ confidence: 0.5 }), item({ key: 'b', decision: 'no' })], {}, { status: 'needs_review', canCertify: false, coverage: { unresolved: 1, rejected: 1 } }], ['open conflict', [item({ category: 'conflicts', confidence: 1 })], {}, { status: 'conflicted', canCertify: false }], ['rejected conflict', [item({ category: 'conflicts', decision: 'no' }), item({ key: 'b', decision: 'yes' })], {}, { status: 'human_reviewed', canCertify: true }], ['stale evidence', [item({ freshness: 'stale', decision: 'yes' })], {}, { status: 'stale', coverage: { stale: 1 } }]] as const)('%s', (_name, items, over, expected) => { expect(derive([...items], over)).toMatchObject(expected); });

  it('certifies only the current fully resolved revision', () => {
    const items = [item({ decision: 'yes' })];
    const first = derive(items);
    expect(derive(items, { certifiedRevision: first.evidenceRevision }).status).toBe('certified_for_outreach');
    expect(derive([item({ confidence: 0.5 })], { certifiedRevision: 'old' })).toMatchObject({ status: 'stale', canCertify: false });
  });
});
