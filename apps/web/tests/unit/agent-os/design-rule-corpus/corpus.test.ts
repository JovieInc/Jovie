import { describe, expect, it } from 'vitest';
import {
  buildFounderRuleReviewQueue,
  createDesignRuleCorpus,
  detectRuleConflicts,
  ingestRuleCandidates,
  negativePreferenceRules,
  normalizeRuleStatement,
  parseDesignRuleCorpus,
  promoteRule,
  queryDesignRules,
  recordAdversarialHardening,
  recordFounderRuleDecision,
  routeForRuleClass,
  ruleReviewScore,
  serializeDesignRuleCorpus,
} from '@/lib/agent-os/design-rule-corpus/corpus';
import {
  ingestDesignRuleSeedCorpus,
  loadDesignRuleCandidateSeeds,
} from '@/lib/agent-os/design-rule-corpus/seed';
import {
  DESIGN_RULE_DOMAINS,
  type DesignRuleCandidate,
} from '@/lib/agent-os/design-rule-corpus/types';

const T0 = '2026-09-29T00:00:00.000Z';
const T1 = '2026-09-29T01:00:00.000Z';
const T2 = '2026-09-29T02:00:00.000Z';
const T3 = '2026-09-29T03:00:00.000Z';

function candidate(
  id: string,
  overrides: Partial<DesignRuleCandidate> = {}
): DesignRuleCandidate {
  return {
    id,
    statement: `Rule statement ${id}.`,
    domain: 'grids-alignment',
    hierarchyLevel: 'molecule',
    proposedClass: 'strong-default',
    contexts: [],
    exceptions: [],
    sources: [{ class: 'nng', title: 'NN/g heuristics' }],
    leverage: 0.7,
    fanout: 0.7,
    confidence: 0.8,
    novelty: 0.6,
    relatedRuleIds: [],
    conflictingRuleIds: [],
    enforcementMode: 'visual-semantic',
    fixtures: [],
    proposedAt: T0,
    ...overrides,
  };
}

function ingest(
  ...candidates: DesignRuleCandidate[]
): ReturnType<typeof ingestRuleCandidates> {
  return ingestRuleCandidates(createDesignRuleCorpus(T0), candidates);
}

describe('ingestRuleCandidates', () => {
  it('ingests mined candidates as undecided candidates with provenance', () => {
    const { corpus, added } = ingest(
      candidate('r1', { sources: [{ class: 'apple-hig', title: 'Apple HIG' }] })
    );
    expect(added).toEqual(['r1']);
    expect(corpus.rules.r1.status).toBe('candidate');
    expect(corpus.rules.r1.sources[0].class).toBe('apple-hig');
    expect(corpus.rules.r1.founderDecision).toBeNull();
    expect(corpus.rules.r1.route).toBeNull();
  });

  it('dedupes a semantically identical candidate against an existing rule', () => {
    const { corpus, added, duplicates } = ingest(
      candidate('r1', {
        statement: 'Elements should align to a shared implied grid.',
      }),
      candidate('r2', {
        statement: 'Elements should align to a shared implied grid!',
      })
    );
    expect(added).toEqual(['r1']);
    expect(duplicates).toEqual([{ candidateId: 'r2', coveredById: 'r1' }]);
    expect(corpus.rules.r2).toBeUndefined();
  });

  it('keeps similar statements in different domains as separate candidates', () => {
    const { added } = ingest(
      candidate('r1', {
        domain: 'color',
        statement: 'Contrast must meet minimum ratios.',
      }),
      candidate('r2', {
        domain: 'accessibility',
        statement: 'Contrast must meet minimum ratios.',
      })
    );
    expect(added).toEqual(['r1', 'r2']);
  });
});

describe('detectRuleConflicts', () => {
  it('surfaces declared conflicts', () => {
    const { corpus } = ingest(
      candidate('r1', { conflictingRuleIds: ['r2'] }),
      candidate('r2')
    );
    expect(detectRuleConflicts(corpus)).toEqual([
      { leftId: 'r1', rightId: 'r2', reason: 'declared' },
    ]);
  });

  it('detects same-domain statements that differ only in negation polarity', () => {
    const { corpus } = ingest(
      candidate('r1', {
        statement: 'Sidebar overlays always extend beyond the sidebar width.',
      }),
      candidate('r2', {
        statement: 'Sidebar overlays never extend beyond the sidebar width.',
      })
    );
    const conflicts = detectRuleConflicts(corpus);
    expect(conflicts).toContainEqual({
      leftId: 'r1',
      rightId: 'r2',
      reason: 'negation-overlap',
    });
  });
});

describe('buildFounderRuleReviewQueue', () => {
  it('ranks undecided candidates by leverage x fanout x confidence x novelty', () => {
    const { corpus } = ingest(
      candidate('low', { leverage: 0.2 }),
      candidate('high', { leverage: 0.9, fanout: 0.9 })
    );
    const queue = buildFounderRuleReviewQueue(corpus);
    expect(queue.map(item => item.id)).toEqual(['high', 'low']);
    expect(queue[0].prompt).toContain('Accept, reject');
  });

  it('omits rules that already have a founder decision', () => {
    const { corpus } = ingest(candidate('r1'));
    const decided = recordFounderRuleDecision(corpus, 'r1', {
      id: 'd1',
      decision: 'accept',
      reviewer: 'Tim',
      verbatimRationale: 'Yes, this is us.',
      decidedAt: T1,
    });
    expect(buildFounderRuleReviewQueue(decided)).toEqual([]);
  });
});

describe('recordFounderRuleDecision', () => {
  it('accept leaves the rule accepted but not yet active', () => {
    const { corpus } = ingest(candidate('r1'));
    const next = recordFounderRuleDecision(corpus, 'r1', {
      id: 'd1',
      decision: 'accept',
      reviewer: 'Tim',
      verbatimRationale: 'Yes.',
      decidedAt: T1,
    });
    expect(next.rules.r1.status).toBe('accepted');
    expect(next.rules.r1.route).toBeNull();
    expect(next.rules.r1.founderDecision?.verbatimRationale).toBe('Yes.');
  });

  it('reject records durable negative evidence', () => {
    const { corpus } = ingest(candidate('r1'));
    const next = recordFounderRuleDecision(corpus, 'r1', {
      id: 'd1',
      decision: 'reject',
      reviewer: 'Tim',
      verbatimRationale: 'Never do this.',
      decidedAt: T1,
    });
    expect(next.rules.r1.status).toBe('rejected');
    expect(next.rules.r1.route).toBe('negative-evidence');
    expect(negativePreferenceRules(next).map(r => r.id)).toEqual(['r1']);
  });

  it('modify requires a replacement statement and preserves verbatim rationale', () => {
    const { corpus } = ingest(candidate('r1'));
    expect(() =>
      recordFounderRuleDecision(corpus, 'r1', {
        id: 'd1',
        decision: 'modify',
        reviewer: 'Tim',
        verbatimRationale: 'Close but wrong scope.',
        decidedAt: T1,
      })
    ).toThrow(/modifiedStatement/);
    const next = recordFounderRuleDecision(corpus, 'r1', {
      id: 'd1',
      decision: 'modify',
      reviewer: 'Tim',
      verbatimRationale: 'Close but wrong scope — keep it to sidebars.',
      modifiedStatement:
        'Alignment seams matter most within the sidebar surface.',
      decidedAt: T1,
    });
    expect(next.rules.r1.statement).toContain('sidebar');
    expect(next.rules.r1.founderDecision?.verbatimRationale).toContain(
      'Close but wrong scope'
    );
  });

  it('contextual requires context clauses and marks the rule contextualized', () => {
    const { corpus } = ingest(candidate('r1'));
    const next = recordFounderRuleDecision(corpus, 'r1', {
      id: 'd1',
      decision: 'contextual',
      reviewer: 'Tim',
      verbatimRationale: 'Only inside narrow rails.',
      contextClauses: ['inside narrow sidebars'],
      decidedAt: T1,
    });
    expect(next.rules.r1.status).toBe('contextualized');
    expect(next.rules.r1.contexts).toContain('inside narrow sidebars');
  });

  it('already-covered requires an existing covering rule', () => {
    const { corpus } = ingest(candidate('r1'), candidate('r2'));
    expect(() =>
      recordFounderRuleDecision(corpus, 'r2', {
        id: 'd1',
        decision: 'already-covered',
        reviewer: 'Tim',
        verbatimRationale: 'Duplicate.',
        coveredById: 'missing',
        decidedAt: T1,
      })
    ).toThrow(/unknown covering rule/);
    const next = recordFounderRuleDecision(corpus, 'r2', {
      id: 'd1',
      decision: 'already-covered',
      reviewer: 'Tim',
      verbatimRationale: 'Duplicate.',
      coveredById: 'r1',
      decidedAt: T1,
    });
    expect(next.rules.r2.status).toBe('covered');
  });

  it('never re-asks a decided rule', () => {
    const { corpus } = ingest(candidate('r1'));
    const next = recordFounderRuleDecision(corpus, 'r1', {
      id: 'd1',
      decision: 'accept',
      reviewer: 'Tim',
      verbatimRationale: 'Yes.',
      decidedAt: T1,
    });
    expect(() =>
      recordFounderRuleDecision(next, 'r1', {
        id: 'd2',
        decision: 'reject',
        reviewer: 'Tim',
        verbatimRationale: 'Changed my mind.',
        decidedAt: T2,
      })
    ).toThrow(/already has a founder decision/);
  });
});

function acceptedCorpus(
  cls: DesignRuleCandidate['proposedClass'] = 'strong-default'
) {
  const { corpus } = ingest(candidate('r1', { proposedClass: cls }));
  return recordFounderRuleDecision(corpus, 'r1', {
    id: 'd1',
    decision: 'accept',
    reviewer: 'Tim',
    verbatimRationale: 'Yes.',
    decidedAt: T1,
  });
}

const hardening = (
  overrides: Record<string, unknown> = {}
): Parameters<typeof recordAdversarialHardening>[2] => ({
  id: 'h1',
  hardenedBy: 'adversarial-review-agent',
  evaluatedSurfaces: [
    { surfaceId: 'homepage', verdict: 'better', note: 'Tighter seams.' },
    { surfaceId: 'public-profile', verdict: 'neutral', note: 'No change.' },
    { surfaceId: 'app-shell', verdict: 'better', note: 'Cleaner.' },
    { surfaceId: 'checkout', verdict: 'neutral', note: 'No change.' },
    { surfaceId: 'dashboard', verdict: 'better', note: 'Cleaner.' },
  ],
  adversarialFindings: [],
  addedExceptions: [],
  finalClass: 'strong-default',
  hardenedAt: T2,
  ...overrides,
});

describe('phase B adversarial hardening', () => {
  it('blocks promotion of a bare founder accept without hardening', () => {
    const corpus = acceptedCorpus();
    expect(() => promoteRule(corpus, 'r1', T2)).toThrow(
      /adversarial hardening/
    );
  });

  it('refuses hard-invariant hardening when a surface got worse with no exceptions', () => {
    const corpus = acceptedCorpus();
    expect(() =>
      recordAdversarialHardening(
        corpus,
        'r1',
        hardening({
          finalClass: 'hard-invariant',
          evaluatedSurfaces: [
            { surfaceId: 'checkout', verdict: 'worse', note: 'Breaks layout.' },
          ],
        })
      )
    ).toThrow(/cannot harden as a hard invariant/);
  });

  it('allows downgrading a harmful rule to strong-default with exceptions', () => {
    const corpus = acceptedCorpus();
    const next = recordAdversarialHardening(
      corpus,
      'r1',
      hardening({
        evaluatedSurfaces: [
          {
            surfaceId: 'checkout',
            verdict: 'worse',
            note: 'Forced seam misaligns totals.',
          },
        ],
        addedExceptions: ['checkout totals column'],
        adversarialFindings: ['Forced alignment can distort dense tables.'],
      })
    );
    expect(next.rules.r1.status).toBe('hardened');
    expect(next.rules.r1.activeClass).toBe('strong-default');
    expect(next.rules.r1.exceptions).toContain('checkout totals column');
  });
});

describe('promotion routing', () => {
  it('routes each final class to its consuming system', () => {
    expect(routeForRuleClass('hard-invariant')).toBe('invariant-registry');
    expect(routeForRuleClass('anti-pattern')).toBe('promotion-court-fixtures');
    expect(routeForRuleClass('taste-preference')).toBe('reference-corpus');
    expect(routeForRuleClass('strong-default')).toBe('refinement-retrieval');
    expect(routeForRuleClass('contextual')).toBe('refinement-retrieval');
  });

  it('promotes a hardened rule into its consumer route', () => {
    const corpus = acceptedCorpus('anti-pattern');
    const hardened = recordAdversarialHardening(
      corpus,
      'r1',
      hardening({ finalClass: 'anti-pattern' })
    );
    const promoted = promoteRule(hardened, 'r1', T3);
    expect(promoted.rules.r1.status).toBe('promoted');
    expect(promoted.rules.r1.route).toBe('promotion-court-fixtures');
    expect(promoted.rules.r1.promotedAt).toBe(T3);
  });
});

describe('serialization', () => {
  it('round-trips the corpus', () => {
    const { corpus } = ingest(candidate('r1'));
    expect(
      parseDesignRuleCorpus(JSON.parse(serializeDesignRuleCorpus(corpus)))
    ).toEqual(corpus);
  });
});

describe('normalizeRuleStatement', () => {
  it('ignores case, punctuation, and stopwords', () => {
    expect(normalizeRuleStatement('Elements SHOULD align to the grid!')).toBe(
      normalizeRuleStatement('elements align grid')
    );
  });
});

describe('ruleReviewScore', () => {
  it('multiplies ranking inputs', () => {
    expect(
      ruleReviewScore({ leverage: 1, fanout: 1, confidence: 1, novelty: 0.5 })
    ).toBe(0.5);
  });
});

describe('queryDesignRules', () => {
  it('filters by status, domain, class, and route', () => {
    const corpus = promoteRule(
      recordAdversarialHardening(
        acceptedCorpus('anti-pattern'),
        'r1',
        hardening({ finalClass: 'anti-pattern' })
      ),
      'r1',
      T3
    );
    expect(queryDesignRules(corpus, { status: 'promoted' })).toHaveLength(1);
    expect(
      queryDesignRules(corpus, { route: 'promotion-court-fixtures' })
    ).toHaveLength(1);
    expect(queryDesignRules(corpus, { domain: 'color' })).toHaveLength(0);
  });
});

describe('seed corpus', () => {
  it('ingests at least 200 unique atomic candidates across every domain', async () => {
    const { corpus, added, duplicates } = await ingestDesignRuleSeedCorpus(
      createDesignRuleCorpus(T0)
    );
    expect(added.length).toBeGreaterThanOrEqual(200);
    expect(new Set(added).size).toBe(added.length);
    const covered = new Set(added.map(id => corpus.rules[id].domain));
    for (const domain of DESIGN_RULE_DOMAINS) {
      expect(covered.has(domain), `missing domain ${domain}`).toBe(true);
    }
    // Duplicates that slipped through mining are reported, not silent.
    for (const dup of duplicates) {
      expect(corpus.rules[dup.coveredById]).toBeDefined();
    }
  });

  it('every seed candidate is atomic with provenance', async () => {
    const seeds = await loadDesignRuleCandidateSeeds();
    for (const seed of seeds) {
      expect(seed.sources.length).toBeGreaterThanOrEqual(1);
      expect(seed.statement.split(' ').length).toBeLessThanOrEqual(60);
    }
  });
});
