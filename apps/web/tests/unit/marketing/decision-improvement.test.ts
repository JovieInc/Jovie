import { describe, expect, it } from 'vitest';
import {
  freezeMarketingDecisionCandidate,
  freezeMarketingDecisionContext,
  freezeMarketingDecisionIncumbent,
  invalidateMarketingDecisionDependencies,
  isMarketingMutationPathAllowed,
  MARKETING_PROTECTED_DIMENSIONS,
  type MarketingCandidateEvaluation,
  type MarketingDecisionCandidate,
  type MarketingDecisionContextInput,
  type MarketingDecisionIncumbent,
  type MarketingProtectedCheck,
  marketingDecisionCandidateDigest,
  marketingDecisionContextDigest,
  marketingDecisionDigest,
  marketingDecisionIncumbentDigest,
  resolveMarketingEligibility,
  selectMarketingDecision,
  validateMarketingDecisionCandidate,
} from '@/data/marketing/decision';
import {
  eligibilityFromMarketingSemanticReviews,
  type MarketingSemanticReviewLike,
  runMarketingPageImprovementLoop,
} from '@/data/marketing/improvement';

function contextInput(
  overrides: Partial<Omit<MarketingDecisionContextInput, 'contextDigest'>> = {}
): MarketingDecisionContextInput {
  const input = {
    decisionId: 'decision-1',
    pageId: 'artist-profiles',
    audience: 'independent artists',
    offer: 'owned artist profile',
    conversionObjective: 'claim a profile',
    claimRevision: 'claims-1',
    recipeRevision: 'recipe-1',
    rubricRevision: 'rubric-1',
    sourceRevision: 'source-1',
    allowedMutationScope: ['copy.*'],
    dependencyGraph: {
      copy: ['semantic'],
      semantic: ['composition'],
    },
    ...overrides,
  };
  return {
    ...input,
    contextDigest: marketingDecisionContextDigest(input),
  };
}

function incumbent(
  value = { copy: { headline: 'Old headline' } }
): MarketingDecisionIncumbent<typeof value> {
  const input = {
    id: 'incumbent-1',
    sourceRevision: 'source-1',
    value,
    dependencyIds: ['copy'],
  };
  return freezeMarketingDecisionIncumbent({
    ...input,
    digest: marketingDecisionIncumbentDigest(input),
  });
}

function candidate(
  id: string,
  value: { copy: { headline: string } },
  changedPaths: readonly string[] = ['copy.headline']
): MarketingDecisionCandidate<typeof value> {
  const input = {
    id,
    value,
    changedPaths,
    dependencyIds: ['copy'],
  };
  return freezeMarketingDecisionCandidate({
    ...input,
    digest: marketingDecisionCandidateDigest(input),
  });
}

function candidateForValue<TValue>(
  id: string,
  value: TValue,
  changedPaths: readonly string[] = ['copy.headline'],
  dependencyIds: readonly string[] = ['copy']
): MarketingDecisionCandidate<TValue> {
  const input = {
    id,
    value,
    changedPaths,
    dependencyIds,
  };
  return freezeMarketingDecisionCandidate({
    ...input,
    digest: marketingDecisionCandidateDigest(input),
  });
}

function protectedChecks(
  verdict: MarketingProtectedCheck['verdict'] = 'pass'
): readonly MarketingProtectedCheck[] {
  return MARKETING_PROTECTED_DIMENSIONS.map(dimension => ({
    dimension,
    verdict,
    evidenceRefs: [`evidence:${dimension}`],
  }));
}

function preference(
  contextDigest: string,
  incumbentDigest: string,
  candidateId: string,
  comparedCandidateIds: readonly string[]
) {
  return {
    contextDigest,
    incumbentDigest,
    status: 'candidate' as const,
    candidateId,
    comparedCandidateIds,
    reason: 'candidate is clearer while protected checks remain green',
  };
}

describe('marketing page decision contracts', () => {
  it('freezes a cloned context and rejects a digest that does not bind its fields', () => {
    const input = contextInput();
    const context = freezeMarketingDecisionContext(input);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.dependencyGraph)).toBe(true);
    expect(() =>
      freezeMarketingDecisionContext({ ...input, offer: 'changed offer' })
    ).toThrow(/context digest/);
  });

  it('requires actual leaf mutations to be declared and in the allowed scope', () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const candidateWithHiddenOfferChange = candidate(
      'candidate-hidden',
      {
        copy: { headline: 'New headline' },
      },
      ['copy.headline']
    );
    const findings = validateMarketingDecisionCandidate({
      context,
      incumbent: {
        ...current,
        value: { copy: { headline: 'Old headline' }, offer: 'changed offer' },
      },
      candidate: candidateWithHiddenOfferChange,
    });
    expect(findings.map(finding => finding.code)).toContain(
      'mutation-out-of-scope'
    );

    const outOfScope = candidate(
      'candidate-outside',
      {
        copy: { headline: 'New headline' },
      },
      ['audience']
    );
    expect(
      validateMarketingDecisionCandidate({
        context,
        incumbent: current,
        candidate: outOfScope,
      }).map(finding => finding.code)
    ).toContain('mutation-out-of-scope');

    const broadContext = freezeMarketingDecisionContext(
      contextInput({ allowedMutationScope: ['*'] })
    );
    const contextIncumbent = incumbent({
      context: { offer: 'old offer' },
      copy: { headline: 'Old headline' },
    });
    const contextMutation = candidateForValue(
      'candidate-context',
      {
        context: { offer: 'new offer' },
        copy: { headline: 'New headline' },
      },
      ['*']
    );
    expect(
      validateMarketingDecisionCandidate({
        context: broadContext,
        incumbent: contextIncumbent,
        candidate: contextMutation,
      }).map(finding => finding.code)
    ).toContain('mutation-out-of-scope');
    expect(isMarketingMutationPathAllowed('context.offer', ['*'])).toBe(false);
  });

  it('fails closed when a protected check is missing proof or the caller forges green status', () => {
    const uncertain = resolveMarketingEligibility({
      checks: [
        ...protectedChecks(),
        {
          dimension: 'copy',
          verdict: 'pass',
          evidenceRefs: [],
        },
      ],
    });
    expect(uncertain.status).toBe('uncertain');
    expect(uncertain.findings.map(finding => finding.code)).toContain(
      'protected-check-uncertain'
    );

    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const first = candidate('candidate-a', {
      copy: { headline: 'A' },
    });
    const second = candidate('candidate-b', {
      copy: { headline: 'B' },
    });
    const forged: MarketingCandidateEvaluation<typeof first.value>[] = [
      {
        candidate: first,
        eligibility: {
          status: 'eligible',
          checks: [
            {
              dimension: 'claim-support',
              verdict: 'pass',
              evidenceRefs: [],
            },
          ],
          findings: [],
        },
      },
      {
        candidate: second,
        eligibility: {
          status: 'eligible',
          checks: protectedChecks(),
          findings: [],
        },
      },
    ];
    const selection = selectMarketingDecision({
      contextDigest: context.contextDigest,
      stage: 'copy',
      incumbent: current,
      evaluations: forged,
      preference: preference(context.contextDigest, current.digest, second.id, [
        second.id,
      ]),
    });
    expect(selection.status).toBe('accepted');
    expect(selection.selectedCandidate?.id).toBe(second.id);
    expect(selection.eligibleCandidateIds).not.toContain(first.id);
  });

  it('retains the incumbent for ties and invalidates dependent evidence transitively', () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const first = candidate('candidate-a', { copy: { headline: 'A' } });
    const second = candidate('candidate-b', { copy: { headline: 'B' } });
    const evaluations = [first, second].map(candidateValue => ({
      candidate: candidateValue,
      eligibility: resolveMarketingEligibility({
        checks: protectedChecks(),
      }),
    }));
    const selection = selectMarketingDecision({
      contextDigest: context.contextDigest,
      stage: 'copy',
      incumbent: current,
      evaluations,
      preference: {
        contextDigest: context.contextDigest,
        incumbentDigest: current.digest,
        status: 'tie',
        comparedCandidateIds: [first.id, second.id],
        reason: 'equivalent',
      },
    });
    expect(selection.status).toBe('incumbent-retained');
    expect(selection.stopReason).toBe('incumbent-retained-tie');
    expect(
      invalidateMarketingDecisionDependencies({
        changedPaths: ['copy.headline'],
        dependencies: [
          { id: 'copy', paths: ['copy.*'] },
          { id: 'semantic', paths: ['semantic'], dependsOn: ['copy'] },
          {
            id: 'composition',
            paths: ['composition'],
            dependsOn: ['semantic'],
          },
        ],
      })
    ).toEqual(['composition', 'copy', 'semantic']);
  });

  it('treats an omitted object section as one actual mutation leaf', () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent({
      sections: { hero: { title: 'Hero' } },
      copy: { headline: 'Old headline' },
    });
    const omitted = candidateForValue(
      'candidate-omit',
      { copy: { headline: 'New headline' } },
      ['copy.headline']
    );
    const findings = validateMarketingDecisionCandidate({
      context,
      incumbent: current,
      candidate: omitted,
    });
    expect(findings.map(finding => finding.code)).toContain(
      'mutation-out-of-scope'
    );
    expect(
      findings.find(finding => finding.message.includes('$.sections'))
    ).toBeDefined();
  });

  it('retains the incumbent when preference evidence is stale or incomplete', () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const first = candidate('candidate-a', { copy: { headline: 'A' } });
    const second = candidate('candidate-b', { copy: { headline: 'B' } });
    const evaluations = [first, second].map(candidateValue => ({
      candidate: candidateValue,
      eligibility: resolveMarketingEligibility({ checks: protectedChecks() }),
    }));
    const stale = selectMarketingDecision({
      contextDigest: context.contextDigest,
      stage: 'copy',
      incumbent: current,
      evaluations,
      preference: preference(
        `${context.contextDigest}:stale`,
        current.digest,
        first.id,
        [first.id, second.id]
      ),
    });
    expect(stale.status).toBe('incumbent-retained');
    expect(stale.stopReason).toBe('preference-unavailable');
    const incomplete = selectMarketingDecision({
      contextDigest: context.contextDigest,
      stage: 'copy',
      incumbent: current,
      evaluations,
      preference: preference(context.contextDigest, current.digest, first.id, [
        first.id,
      ]),
    });
    expect(incomplete.stopReason).toBe('preference-unavailable');
  });
});

describe('bounded marketing page improvement loop', () => {
  it('runs candidate generation through semantic eligibility and preference, then records separate outcomes', async () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const first = candidate('candidate-a', { copy: { headline: 'A' } });
    const second = candidate('candidate-b', { copy: { headline: 'B' } });
    const seenOutcomes: unknown[] = [];
    const review = (
      candidateValue: MarketingDecisionCandidate<typeof first.value>
    ) =>
      MARKETING_PROTECTED_DIMENSIONS.slice(0, 3).map((checkId, index) => ({
        checkId: (
          ['claim-support', 'section-overlap', 'cta-expectation'] as const
        )[index],
        status: 'supported' as const,
        findings: [],
        evidenceRefs: [`jev:${candidateValue.id}:${checkId}`],
        fingerprint: `fingerprint:${candidateValue.id}:${checkId}`,
        advisory: true as const,
        certified: false as const,
      }));
    const result = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      generateCandidates: () => [first, second],
      reviewSemantic: ({ candidate: candidateValue }) => review(candidateValue),
      choosePreference: ({ eligibleCandidates }) =>
        preference(
          context.contextDigest,
          current.digest,
          eligibleCandidates[0]!.id,
          eligibleCandidates.map(candidateValue => candidateValue.id)
        ),
      commercialLink: {
        source: 'existing-outcome-loop',
        variantId: first.id,
      },
      recordOutcomes: outcomes => {
        seenOutcomes.push(outcomes);
      },
    });

    expect(result.status).toBe('accepted');
    expect(result.stopReason).toBe('accepted-improvement');
    expect(result.selectedCandidateDigest).toBe(first.digest);
    expect(result.finalIncumbent.digest).not.toBe(first.digest);
    expect(result.composition).toMatchObject({
      status: 'accepted-for-composition',
      candidateDigest: first.digest,
      requiresRevalidation: true,
    });
    expect(result.certificate.certified).toBe(false);
    expect(result.outcomes.taste.status).toBe('pending');
    expect(result.outcomes.commercial.status).toBe('unknown');
    expect(result.outcomes.semantic).toHaveLength(6);
    expect(result.outcomes.semantic.map(record => record.candidateId)).toEqual(
      expect.arrayContaining([first.id, second.id])
    );
    const candidateDigests = new Map([
      [first.id, first.digest],
      [second.id, second.digest],
    ]);
    expect(
      result.outcomes.semantic.every(
        record =>
          record.candidateDigest === candidateDigests.get(record.candidateId) &&
          record.evidenceRefs.every(ref =>
            ref.includes(`:${record.candidateId}:`)
          )
      )
    ).toBe(true);
    expect(seenOutcomes).toHaveLength(1);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('routes repeated protected failures to targeted repair and stops before the bounded retry becomes a loop', async () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const generated: MarketingDecisionCandidate<{
      copy: { headline: string };
    }>[] = [];
    const result = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      // The requested 99 attempts are clamped to the canonical stage cap.
      stageAttemptLimit: 99,
      generateCandidates: ({ attempt }) => {
        const first = candidate(`failed-${attempt}-a`, {
          copy: { headline: `failed ${attempt} a` },
        });
        const second = candidate(`failed-${attempt}-b`, {
          copy: { headline: `failed ${attempt} b` },
        });
        generated.push(first, second);
        return [first, second];
      },
      evaluateEligibility: () =>
        resolveMarketingEligibility({
          checks: protectedChecks('fail'),
        }),
    });
    expect(result.status).toBe('unresolved');
    expect(result.stopReason).toBe('repeated-failure');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.repairs[0]?.target).toBe('truth');
    expect(result.finalIncumbent.digest).toBe(current.digest);
    expect(
      new Set(generated.map(candidateValue => candidateValue.digest)).size
    ).toBe(generated.length);
  });

  it('enforces both the canonical stage cap and the lower caller total cap', async () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent({
      copy: { headline: 'Old', subhead: 'Old', alt: 'Old' },
    });
    const candidatesForAttempt = (attempt: number) => {
      const field = ['headline', 'subhead', 'alt'][attempt - 1] ?? 'headline';
      return [0, 1].map(index =>
        candidateForValue(
          `failed-${attempt}-${index}`,
          {
            copy: {
              headline: field === 'headline' ? `H${attempt}-${index}` : 'Old',
              subhead: field === 'subhead' ? `S${attempt}-${index}` : 'Old',
              alt: field === 'alt' ? `A${attempt}-${index}` : 'Old',
            },
          },
          [`copy.${field}`]
        )
      );
    };
    const run = (totalAttemptLimit: number) =>
      runMarketingPageImprovementLoop({
        context,
        stage: 'copy',
        incumbent: current,
        stageAttemptLimit: 99,
        totalAttemptLimit,
        generateCandidates: ({ attempt }) => candidatesForAttempt(attempt),
        evaluateEligibility: () =>
          resolveMarketingEligibility({ checks: protectedChecks('fail') }),
      });

    const totalBounded = await run(2);
    expect(totalBounded.stopReason).toBe('total-budget-exhausted');
    expect(totalBounded.attempts).toHaveLength(2);

    const stageBounded = await run(12);
    expect(stageBounded.stopReason).toBe('stage-budget-exhausted');
    expect(stageBounded.attempts).toHaveLength(3);
  });

  it('stops before callbacks on abort and converts reviewer rejection into a bounded stop', async () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const controller = new AbortController();
    controller.abort();
    let generated = 0;
    const aborted = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      signal: controller.signal,
      generateCandidates: () => {
        generated += 1;
        return [
          candidate('abort-a', { copy: { headline: 'A' } }),
          candidate('abort-b', { copy: { headline: 'B' } }),
        ];
      },
      evaluateEligibility: () =>
        resolveMarketingEligibility({ checks: protectedChecks() }),
    });
    expect(aborted.stopReason).toBe('reviewer-unavailable');
    expect(aborted.attempts).toHaveLength(0);
    expect(generated).toBe(0);

    let preferenceCalls = 0;
    const rejected = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      generateCandidates: () => [
        candidate('reject-a', { copy: { headline: 'A' } }),
        candidate('reject-b', { copy: { headline: 'B' } }),
      ],
      evaluateEligibility: () => {
        throw new Error('reviewer rejected request');
      },
      choosePreference: () => {
        preferenceCalls += 1;
        return preference(context.contextDigest, current.digest, 'reject-a', [
          'reject-a',
          'reject-b',
        ]);
      },
    });
    expect(rejected.stopReason).toBe('reviewer-unavailable');
    expect(rejected.attempts).toHaveLength(1);
    expect(preferenceCalls).toBe(0);
  });

  it('retains the incumbent when a reviewer claims green without evidence', async () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    let preferenceCalls = 0;
    const result = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      generateCandidates: () => [
        candidate('missing-proof-a', { copy: { headline: 'A' } }),
        candidate('missing-proof-b', { copy: { headline: 'B' } }),
      ],
      evaluateEligibility: () => ({
        status: 'eligible',
        checks: protectedChecks().map((check, index) =>
          index === 0 ? { ...check, evidenceRefs: [] } : check
        ),
        findings: [],
      }),
      choosePreference: () => {
        preferenceCalls += 1;
        return preference(
          context.contextDigest,
          current.digest,
          'missing-proof-a',
          ['missing-proof-a', 'missing-proof-b']
        );
      },
    });
    expect(result.status).toBe('incumbent-retained');
    expect(result.stopReason).toBe('incumbent-retained-uncertainty');
    expect(preferenceCalls).toBe(0);
  });

  it('records no-candidate and unavailable-preference stop reasons', async () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const empty = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      generateCandidates: () => [],
      evaluateEligibility: () =>
        resolveMarketingEligibility({ checks: protectedChecks() }),
    });
    expect(empty.stopReason).toBe('no-candidates');
    expect(empty.attempts).toHaveLength(0);

    const unavailablePreference = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      generateCandidates: () => [
        candidate('no-preference-a', { copy: { headline: 'A' } }),
        candidate('no-preference-b', { copy: { headline: 'B' } }),
      ],
      evaluateEligibility: () =>
        resolveMarketingEligibility({ checks: protectedChecks() }),
    });
    expect(unavailablePreference.status).toBe('incumbent-retained');
    expect(unavailablePreference.stopReason).toBe('preference-unavailable');
  });

  it('stops replay when the generator changes only candidate identifiers', async () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const firstA = candidate('replay-a-1', { copy: { headline: 'A' } });
    const firstB = candidate('replay-b-1', { copy: { headline: 'B' } });
    const secondA = candidate('replay-a-2', { copy: { headline: 'A' } });
    const secondB = candidate('replay-b-2', { copy: { headline: 'B' } });
    expect(firstA.digest).not.toBe(secondA.digest);
    expect(
      marketingDecisionDigest({
        contextDigest: context.contextDigest,
        value: firstA.value,
      })
    ).toBe(
      marketingDecisionDigest({
        contextDigest: context.contextDigest,
        value: secondA.value,
      })
    );
    const result = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      generateCandidates: ({ attempt }) =>
        attempt === 1 ? [firstA, firstB] : [secondA, secondB],
      evaluateEligibility: () =>
        resolveMarketingEligibility({ checks: protectedChecks('fail') }),
    });
    expect(result.stopReason).toBe('repeated-failure');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[1]?.validationFindings).toContain(
      'candidate payload repeated across attempts'
    );
  });

  it('downgrades unbound taste and unproven commercial outcomes to safe statuses', async () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    const first = candidate('outcome-a', { copy: { headline: 'A' } });
    const second = candidate('outcome-b', { copy: { headline: 'B' } });
    const result = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      generateCandidates: () => [first, second],
      evaluateEligibility: () =>
        resolveMarketingEligibility({ checks: protectedChecks() }),
      choosePreference: ({ eligibleCandidates }) =>
        preference(
          context.contextDigest,
          current.digest,
          eligibleCandidates[0]!.id,
          eligibleCandidates.map(candidateValue => candidateValue.id)
        ),
      buildTasteOutcome: () => ({
        schema: 'marketing-taste-outcome/v1',
        decisionId: context.decisionId,
        contextDigest: context.contextDigest,
        candidateDigest: 'forged-candidate-digest',
        status: 'approved',
        evidenceRefs: ['taste-proof'],
        reviewer: 'founder',
        notes: null,
        certified: false,
      }),
      buildCommercialOutcome: ({ candidateDigest }) => ({
        schema: 'marketing-commercial-outcome/v1',
        decisionId: context.decisionId,
        contextDigest: context.contextDigest,
        candidateDigest,
        status: 'observed-positive',
        link: null,
        evidenceRefs: [],
        metrics: { conversion: 0.1 },
        certified: false,
      }),
    });
    expect(result.outcomes.taste.status).toBe('pending');
    expect(result.outcomes.commercial.status).toBe('unknown');
  });

  it('stops invalid candidate sets before semantic review and keeps certification false', async () => {
    const context = freezeMarketingDecisionContext(contextInput());
    const current = incumbent();
    let reviews = 0;
    const onlyCandidate = candidate('only', { copy: { headline: 'Only' } });
    const result = await runMarketingPageImprovementLoop({
      context,
      stage: 'copy',
      incumbent: current,
      generateCandidates: () => [onlyCandidate],
      reviewSemantic: () => {
        reviews += 1;
        return [];
      },
    });
    expect(result.stopReason).toBe('candidate-limit');
    expect(reviews).toBe(0);
    expect(result.certificate.certified).toBe(false);
  });

  it('maps unavailable semantic review to an explicit stop without treating it as a failure to repair', () => {
    const result = eligibilityFromMarketingSemanticReviews({
      candidateId: 'candidate',
      reviews: [
        {
          checkId: 'claim-support',
          status: 'unavailable',
          findings: ['Gateway unavailable'],
          evidenceRefs: ['request-1'],
          fingerprint: 'fingerprint-1',
          advisory: true,
          certified: false,
        } satisfies MarketingSemanticReviewLike,
      ],
      requiredDimensions: ['claim-support'],
    });
    expect(result.status).toBe('uncertain');
    expect(result.stopReason).toBe('reviewer-unavailable');
  });
});
