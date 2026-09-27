import { describe, expect, it } from 'vitest';

import {
  buildFounderReviewQueue,
  certifiedReferenceToReceipt,
  createDesignReferenceCorpus,
  decertifyReference,
  ingestDesignReference,
  parseDesignReferenceCorpus,
  proposeCandidateEntry,
  queryCandidateEntries,
  queryCertifiedReferences,
  recordFounderCandidateDecision,
  recordFounderCritique,
  recordFounderReferenceDecision,
  serializeDesignReferenceCorpus,
} from '@/lib/agent-os/design-reference-corpus/corpus';
import type { DesignReference } from '@/lib/agent-os/design-reference-corpus/types';

const T0 = '2026-09-26T00:00:00.000Z';
const T1 = '2026-09-26T01:00:00.000Z';
const T2 = '2026-09-26T02:00:00.000Z';

function reference(id: string): DesignReference {
  return {
    id,
    source: {
      kind: 'expert-critique',
      title: `Teardown ${id}`,
      url: `https://example.com/${id}`,
      author: 'Design Critic',
      publishedAt: '2026-09-01T00:00:00.000Z',
      capturedAt: T0,
    },
    pageType: 'marketing-home',
    sections: [
      {
        id: `${id}-hero`,
        designVariable: 'hero',
        pageType: 'marketing-home',
        summary: 'Hero pairs one sharp claim with a single primary CTA.',
        excerpt: 'The hero earns attention with specificity.',
        mediaRef: null,
      },
      {
        id: `${id}-logos`,
        designVariable: 'logo-bar',
        pageType: 'marketing-home',
        summary: 'Logo bar is grayscale and subordinate to the hero.',
        excerpt: null,
        mediaRef: null,
      },
    ],
    notes: null,
    ingestedAt: T0,
  };
}

function approve(id: string) {
  return {
    id: `decision-${id}`,
    decision: 'approved' as const,
    reviewer: 'Tim',
    rationale: 'Matches Jovie bar.',
    decidedAt: T1,
  };
}

describe('ingestDesignReference', () => {
  it('ingests a reference with provenance as proposed', () => {
    const corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );

    const record = corpus.references['ref-a'];
    expect(record.status).toBe('proposed');
    expect(record.reference.source.url).toBe('https://example.com/ref-a');
    expect(record.reference.sections).toHaveLength(2);
  });

  it('rejects duplicate reference ids', () => {
    const corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
    expect(() => ingestDesignReference(corpus, reference('ref-a'), T1)).toThrow(
      /already ingested/
    );
  });
});

describe('proposeCandidateEntry', () => {
  it('stores a candidate invariant derived from ingested critiques', () => {
    let corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
    corpus = proposeCandidateEntry(corpus, {
      id: 'cand-1',
      kind: 'invariant',
      statement: 'A hero must carry exactly one primary CTA.',
      designVariable: 'hero',
      pageType: 'marketing-home',
      derivedFrom: [
        {
          referenceId: 'ref-a',
          sectionId: 'ref-a-hero',
          evidence: 'Critic flags competing CTAs as the top failure.',
        },
      ],
      proposedAt: T1,
    });

    const entry = corpus.candidates['cand-1'];
    expect(entry.status).toBe('proposed');
    expect(entry.kind).toBe('invariant');
  });

  it('rejects candidates that cite unknown evidence', () => {
    const corpus = createDesignReferenceCorpus(T0);
    expect(() =>
      proposeCandidateEntry(corpus, {
        id: 'cand-1',
        kind: 'preference',
        statement: 'Prefer quiet heroes.',
        derivedFrom: [
          { referenceId: 'missing', sectionId: null, evidence: 'x' },
        ],
        proposedAt: T1,
      })
    ).toThrow(/unknown reference/);
  });
});

describe('founder decisions', () => {
  function corpusWithReference() {
    return ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
  }

  it('certifies a reference only after founder approval', () => {
    const proposed = corpusWithReference();
    expect(
      queryCertifiedReferences(proposed, { pageType: 'marketing-home' })
    ).toHaveLength(0);

    const certified = recordFounderReferenceDecision(
      proposed,
      'ref-a',
      approve('ref-a')
    );
    const results = queryCertifiedReferences(certified, {
      pageType: 'marketing-home',
    });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('certified');
    expect(results[0].founderDecision?.rationale).toBe('Matches Jovie bar.');
  });

  it('keeps nuanced decisions certified with the nuance retained', () => {
    const corpus = recordFounderReferenceDecision(
      corpusWithReference(),
      'ref-a',
      {
        id: 'decision-ref-a',
        decision: 'nuanced',
        reviewer: 'Tim',
        rationale: 'Directionally right.',
        nuance: 'Only applies to above-the-fold heroes.',
        decidedAt: T1,
      }
    );
    const record = corpus.references['ref-a'];
    expect(record.status).toBe('certified');
    expect(record.founderDecision?.nuance).toBe(
      'Only applies to above-the-fold heroes.'
    );
  });

  it('requires nuance text for nuanced decisions', () => {
    expect(() =>
      recordFounderReferenceDecision(corpusWithReference(), 'ref-a', {
        id: 'decision-ref-a',
        decision: 'nuanced',
        reviewer: 'Tim',
        rationale: 'Directionally right.',
        decidedAt: T1,
      })
    ).toThrow(/requires nuance text/);
  });

  it('rejected references are never queryable as certified', () => {
    const corpus = recordFounderReferenceDecision(
      corpusWithReference(),
      'ref-a',
      {
        id: 'decision-ref-a',
        decision: 'rejected',
        reviewer: 'Tim',
        rationale: 'Too dense for our bar.',
        decidedAt: T1,
      }
    );
    expect(corpus.references['ref-a'].status).toBe('rejected');
    expect(queryCertifiedReferences(corpus)).toHaveLength(0);
  });

  it('certifies candidates only through founder decision, keeping kinds separate', () => {
    let corpus = corpusWithReference();
    corpus = proposeCandidateEntry(corpus, {
      id: 'cand-inv',
      kind: 'invariant',
      statement: 'One primary CTA per hero.',
      designVariable: 'hero',
      pageType: null,
      derivedFrom: [
        {
          referenceId: 'ref-a',
          sectionId: 'ref-a-hero',
          evidence: 'Recurring critique.',
        },
      ],
      proposedAt: T1,
    });
    corpus = proposeCandidateEntry(corpus, {
      id: 'cand-pref',
      kind: 'preference',
      statement: 'Tim prefers sparse heroes over feature lists.',
      designVariable: 'hero',
      pageType: null,
      derivedFrom: [
        {
          referenceId: 'ref-a',
          sectionId: 'ref-a-hero',
          evidence: 'Founder critique.',
        },
      ],
      proposedAt: T1,
    });

    corpus = recordFounderCandidateDecision(corpus, 'cand-inv', {
      id: 'd1',
      decision: 'approved',
      reviewer: 'Tim',
      rationale: 'Yes, this is a hard rule.',
      decidedAt: T2,
    });

    const invariants = queryCandidateEntries(corpus, {
      kind: 'invariant',
      status: 'certified',
    });
    const preferences = queryCandidateEntries(corpus, {
      kind: 'preference',
      status: 'certified',
    });
    expect(invariants.map(entry => entry.id)).toEqual(['cand-inv']);
    expect(preferences).toHaveLength(0);
  });
});

describe('founder critique capture', () => {
  it('retains raw critique text with structured verdict and A/B target', () => {
    let corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
    corpus = ingestDesignReference(corpus, reference('ref-b'), T0);
    corpus = recordFounderCritique(corpus, {
      id: 'crit-1',
      referenceId: 'ref-a',
      sectionId: 'ref-a-hero',
      critique:
        'The hierarchy is wrong: eyebrow fights the headline, CTA is buried.',
      verdict: 'rejected',
      comparedAgainstId: 'ref-b',
      reviewer: 'Tim',
      recordedAt: T1,
    });

    expect(corpus.critiques).toHaveLength(1);
    expect(corpus.critiques[0].comparedAgainstId).toBe('ref-b');
    expect(corpus.references['ref-a'].status).toBe('proposed');
  });
});

describe('queryCertifiedReferences', () => {
  it('filters sections by design variable', () => {
    let corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
    corpus = recordFounderReferenceDecision(corpus, 'ref-a', approve('ref-a'));

    const heroOnly = queryCertifiedReferences(corpus, {
      pageType: 'marketing-home',
      designVariable: 'hero',
    });
    expect(heroOnly).toHaveLength(1);
    expect(heroOnly[0].reference.sections.map(s => s.id)).toEqual([
      'ref-a-hero',
    ]);

    expect(
      queryCertifiedReferences(corpus, { designVariable: 'faq' })
    ).toHaveLength(0);
  });
});

describe('buildFounderReviewQueue', () => {
  it('queues proposed references and candidates, not certified ones', () => {
    let corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
    corpus = ingestDesignReference(corpus, reference('ref-b'), T0);
    corpus = recordFounderReferenceDecision(corpus, 'ref-b', approve('ref-b'));

    const queue = buildFounderReviewQueue(corpus);
    expect(queue.map(item => item.id)).toEqual(['ref-a']);
    expect(queue[0].kind).toBe('reference');
    expect(queue[0].prompt).toContain('What works, what fails');
  });
});

describe('certification composition', () => {
  it('projects certified references into canonical_references receipts', () => {
    let corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
    corpus = recordFounderReferenceDecision(corpus, 'ref-a', approve('ref-a'));

    const receipt = certifiedReferenceToReceipt(corpus.references['ref-a'], {
      receiptId: 'receipt-1',
      sourceSha: 'a'.repeat(40),
    });
    expect(receipt.tier).toBe('canonical_references');
    expect(receipt.status).toBe('passed');
    expect(receipt.ref).toBe('design-reference-corpus:ref-a');
    expect(receipt.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('refuses to project uncertified references', () => {
    const corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
    expect(() =>
      certifiedReferenceToReceipt(corpus.references['ref-a'], {
        receiptId: 'receipt-1',
        sourceSha: 'a'.repeat(40),
      })
    ).toThrow(/not founder-certified/);
  });
});

describe('reversibility and serialization', () => {
  it('decertification removes the reference from retrieval', () => {
    let corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
    corpus = recordFounderReferenceDecision(corpus, 'ref-a', approve('ref-a'));
    corpus = decertifyReference(corpus, 'ref-a', T2);

    expect(corpus.references['ref-a'].status).toBe('decertified');
    expect(queryCertifiedReferences(corpus)).toHaveLength(0);
  });

  it('round-trips through serialize/parse', () => {
    let corpus = ingestDesignReference(
      createDesignReferenceCorpus(T0),
      reference('ref-a'),
      T0
    );
    corpus = recordFounderReferenceDecision(corpus, 'ref-a', approve('ref-a'));

    const parsed = parseDesignReferenceCorpus(
      JSON.parse(serializeDesignReferenceCorpus(corpus))
    );
    expect(parsed).toEqual(corpus);
  });
});
