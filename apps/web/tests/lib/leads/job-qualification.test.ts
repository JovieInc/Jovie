import { describe, expect, it } from 'vitest';
import {
  type CommercialContext,
  type CommercialEvidence,
  classifyToolRelationship,
  compareQualificationDecisions,
  type JobQualificationInput,
  LEGACY_CUSTOMER_RANKING_WEIGHTS,
  migrateLegacyPaidTier,
  PUBLIC_EVIDENCE_EXTRACTION_VERSION,
  PUBLIC_SIGNAL_POLICY_REGISTRY,
  parseSpotifyArtistId,
  qualifySupportedJob,
  rankCustomer,
  SUPPORTED_JOB_REGISTRY,
} from '@/lib/leads/job-qualification';

const capturedAt = '2026-09-27T05:00:00.000Z';

function input(
  overrides: Partial<JobQualificationInput> = {}
): JobQualificationInput {
  return {
    candidateRunId: 'run-1',
    identity: {
      personId: 'person-1',
      displayName: 'Artist One',
      roles: ['artist'],
      representsIdentityIds: [],
      sourceAliases: ['linktree:artistone'],
      identityConfidence: 0.99,
      identityDecision: 'pass',
    },
    activeGoal: 'publish a claimable artist profile',
    supportedJobId: 'premade-artist-profile',
    observedOpportunity: 'public profile is incomplete',
    source: 'public-linktree',
    timeWindow: {
      startsAt: capturedAt,
      endsAt: '2026-10-04T05:00:00.000Z',
    },
    observations: [
      {
        id: 'obs-profile',
        kind: 'profile',
        observedFact: { incomplete: true },
        provenance: {
          sourceUrl: 'https://linktr.ee/artistone',
          sourceId: 'artistone',
          capturedAt,
          sourceDigest: `sha256:${'a'.repeat(64)}`,
          immutableRef: null,
          extractionVersion: PUBLIC_EVIDENCE_EXTRACTION_VERSION,
          supportingField: 'profile.links',
          supportingExcerpt: null,
        },
        confidence: 0.95,
        uncertainty: [],
        contradictions: [],
      },
    ],
    tools: [
      {
        toolId: 'linktree',
        usageObserved: 'yes',
        paidAccess: 'unknown',
        exactPlan: null,
        exactSpend: null,
        purchaseControl: 'unknown',
        replaceability: 'unknown',
        buyIntent: 'unknown',
        accessBasis: 'unknown',
        evidenceIds: ['obs-profile'],
      },
    ],
    spotifyUrls: ['https://open.spotify.com/artist/abc123'],
    channelEligibility: [
      {
        channel: 'instagram',
        decision: 'pass',
        permissionEvidenceIds: ['obs-profile'],
        reasons: [],
      },
      {
        channel: 'email',
        decision: 'review_needed',
        permissionEvidenceIds: [],
        reasons: ['permission_unknown'],
      },
    ],
    duplicateOf: [],
    existingCustomer: false,
    existingClaim: false,
    priorOutreach: false,
    now: capturedAt,
    evidenceMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

function commercial(): CommercialContext {
  const job = SUPPORTED_JOB_REGISTRY['premade-artist-profile'];
  const scope: CommercialContext['scope'] = {
    buyerId: 'person-1',
    representedEntityId: 'person-1',
    supportedJobId: job.id,
    capabilityVersion: job.capabilityVersion,
    offerId: job.offerId,
    offerVersion: job.offerVersion,
    priceMinor: 4900,
    currency: 'USD',
    cadence: 'month',
  };
  const claims: CommercialEvidence['observedFact'][] = [
    { dimension: 'budget', availableMinor: 4900 },
    { dimension: 'authority', authorized: true },
    { dimension: 'commitment', accepted: true },
    { dimension: 'urgency', deadline: '2026-10-01T05:00:00.000Z' },
  ];
  return {
    scope,
    evidence: claims.map(claim => ({
      ...input().observations[0]!,
      id: `commercial-${claim.dimension}`,
      kind: 'buyer_report',
      observedFact: claim,
      scope,
      basis: 'reported',
      confidenceBasis: 'Buyer response in approved first-party thread',
      coverage: 'observed',
    })),
    needs: [{ featureId: 'public-profile-pages', mustSell: true }],
    capabilities: [
      {
        featureId: 'public-profile-pages',
        capabilityVersion: job.capabilityVersion,
        state: 'monitored',
      },
    ],
    costs: {
      acquisitionMinor: 10,
      researchMinor: 10,
      actionMinor: 10,
      deliveryMinor: 50,
      supportMinor: 50,
    },
    researchBudgetRemainingMinor: 50,
    reservedActionBudgetMinor: 10,
  };
}

describe('job qualification', () => {
  it('never combines unrelated tool intent and purchase control into a commercial pass', () => {
    const tool = input().tools[0]!;
    const result = qualifySupportedJob(
      input({
        tools: [
          { ...tool, toolId: 'tool-a', buyIntent: 'yes' },
          { ...tool, toolId: 'tool-b', purchaseControl: 'yes' },
        ],
      })
    );
    expect(result.commercialDecision.state).toBe('review_needed');
  });
  it('distinguishes Spotify artists from playlists, tracks, and fan links', () => {
    expect(parseSpotifyArtistId('https://open.spotify.com/artist/abc123')).toBe(
      'abc123'
    );
    expect(
      parseSpotifyArtistId('https://open.spotify.com/playlist/abc123')
    ).toBeNull();
    expect(
      parseSpotifyArtistId('https://open.spotify.com/track/abc123')
    ).toBeNull();
    expect(
      parseSpotifyArtistId('https://example.com/artist/abc123')
    ).toBeNull();
  });

  it('preserves tool usage separately from commercial facts', () => {
    const result = qualifySupportedJob(input());
    expect(result.tools[0]).toMatchObject({
      usageObserved: 'yes',
      paidAccess: 'unknown',
      exactPlan: null,
      exactSpend: null,
      purchaseControl: 'unknown',
      replaceability: 'unknown',
      buyIntent: 'unknown',
    });
    expect(result.evidenceDecision.state).toBe('pass');
    expect(result.commercialDecision).toMatchObject({
      state: 'review_needed',
      reasons: ['offer_context_missing'],
    });
  });

  it('allows a supported zero-audience, no-Spotify job', () => {
    const result = qualifySupportedJob(
      input({
        supportedJobId: 'youtube-thumbnail-preview',
        spotifyUrls: [],
        identity: { ...input().identity, roles: ['creator'] },
      })
    );
    expect(result.evidenceDecision.reasons).not.toContain(
      'spotify_artist_required'
    );
    expect(result.supportedJob.requiresAudienceMinimum).toBe(false);
  });

  it('abstains for playlists and same-name artist collisions', () => {
    const playlist = qualifySupportedJob(
      input({ spotifyUrls: ['https://open.spotify.com/playlist/abc123'] })
    );
    const collision = qualifySupportedJob(
      input({
        spotifyUrls: [
          'https://open.spotify.com/artist/abc123',
          'https://open.spotify.com/artist/def456',
        ],
      })
    );
    expect(playlist.evidenceDecision.reasons).toContain(
      'spotify_artist_required'
    );
    expect(collision.evidenceDecision.reasons).toContain(
      'spotify_identity_ambiguous'
    );
    expect(collision.spotifyArtistId).toBeNull();
  });

  it('routes represented identities to review without global disqualification', () => {
    const result = qualifySupportedJob(
      input({
        identity: {
          ...input().identity,
          roles: ['artist', 'manager'],
          representsIdentityIds: ['artist-2'],
        },
      })
    );
    expect(result.overallDecision.state).toBe('review_needed');
    expect(result.overallDecision.reasons).toContain(
      'represented_identity_human_path'
    );
  });

  it('keeps channel permissions separate for a multi-role identity', () => {
    const result = qualifySupportedJob(input());
    expect(result.contactDecisions).toEqual([
      expect.objectContaining({ channel: 'instagram', decision: 'pass' }),
      expect.objectContaining({
        channel: 'email',
        decision: 'review_needed',
      }),
    ]);
  });

  it('fails closed on duplicates while retaining rejected sample eligibility', () => {
    const result = qualifySupportedJob(
      input({ duplicateOf: ['customer-1'], priorOutreach: true })
    );
    expect(result.overallDecision.state).toBe('fail');
    expect(result.explorationSampleEligible).toBe(true);
    expect(result.observations).toHaveLength(1);
  });

  it('routes stale and contradictory evidence to review', () => {
    const base = input();
    const result = qualifySupportedJob({
      ...base,
      now: '2026-10-10T05:00:00.000Z',
      observations: [
        { ...base.observations[0]!, contradictions: ['different artist ID'] },
      ],
    });
    expect(result.evidenceDecision.reasons).toEqual(
      expect.arrayContaining(['stale_evidence', 'evidence_contradiction'])
    );
  });

  it('replays deterministically despite observation and role ordering', () => {
    const first = qualifySupportedJob(input());
    const second = qualifySupportedJob(
      input({
        identity: {
          ...input().identity,
          roles: [...input().identity.roles].reverse(),
          sourceAliases: [...input().identity.sourceAliases].reverse(),
        },
      })
    );
    expect(second.deterministicKey).toBe(first.deterministicKey);
  });

  it('migrates unsupported legacy paid booleans to unknown', () => {
    expect(
      migrateLegacyPaidTier({
        legacyValue: true,
        hasApprovedBillingEvidence: false,
      })
    ).toBe('unknown');
    expect(
      migrateLegacyPaidTier({
        legacyValue: true,
        hasApprovedBillingEvidence: true,
      })
    ).toBe('yes');
    expect(
      migrateLegacyPaidTier({
        legacyValue: false,
        hasApprovedBillingEvidence: false,
      })
    ).toBe('no');
  });

  it('records comparable incumbent and current decisions without rewriting history', () => {
    const comparison = compareQualificationDecisions({
      incumbentDecision: 'qualified',
      incumbentReason: null,
      current: {
        state: 'review_needed',
        reasons: ['buy_intent_unknown'],
        evidenceIds: ['obs-profile'],
      },
    });
    expect(comparison).toEqual({
      incumbent: { decision: 'qualified', reason: null },
      current: expect.objectContaining({ state: 'review_needed' }),
      changed: true,
      compatibilityPolicy: 'preserve_incumbent_record_requalify',
    });
    expect(PUBLIC_SIGNAL_POLICY_REGISTRY.linktree.rules).toMatchObject({
      brandingAbsent: 'paid_access_unknown',
      identityBadge: 'identity_only',
      toolLink: 'usage_only',
    });
  });

  it('classifies tool relationships only from current capability evidence', () => {
    expect(
      classifyToolRelationship({
        capabilitySupportsReplacement: false,
        capabilitySupportsComplement: false,
        requiredForDelivery: false,
      })
    ).toBe('unknown');
    expect(
      classifyToolRelationship({
        capabilitySupportsReplacement: true,
        capabilitySupportsComplement: false,
        requiredForDelivery: false,
      })
    ).toBe('replacement');
  });

  it('keeps historical weights in one compatibility policy without using a payment score', () => {
    expect(LEGACY_CUSTOMER_RANKING_WEIGHTS).toEqual({
      demonstrated: 1,
      cadence: 0.5,
      stated: 0.25,
    });
    const result = qualifySupportedJob(input());
    expect(result.ranking).toMatchObject({
      payScore: null,
      fitScore: null,
      rank: null,
      costs: null,
    });
    expect(result.ranking.unknowns).toContain('cost_unknown');
  });

  it.each([
    ['no signal', undefined, 'research', null],
    ['first-time buyer', commercial(), 'ready_now', 2],
    ['demonstrated category spend only', undefined, 'research', null],
    [
      'unmonitored must-sell',
      { ...commercial(), capabilities: [] },
      'held',
      null,
    ],
    [
      'shipped is not monitored',
      {
        ...commercial(),
        capabilities: [
          { ...commercial().capabilities[0]!, state: 'shipped' as const },
        ],
      },
      'held',
      null,
    ],
  ] as const)('ranks %s by inspectable bands', (_name, context, band, rank) => {
    const result = qualifySupportedJob(
      input({
        commercial: context,
        tools: [
          {
            ...input().tools[0]!,
            paidAccess: 'yes',
            exactSpend: 150,
            purchaseControl: 'yes',
            buyIntent: 'yes',
          },
        ],
      })
    );
    expect(result.ranking).toMatchObject({
      band,
      rank,
      payScore: null,
      requiredApprovals: ['tim_outbound_approval'],
    });
    if (band === 'held')
      expect(result.ranking.heldFor).toEqual(['public-profile-pages']);
    if (rank)
      expect(result.ranking.nextAction).toBe('request_outbound_approval');
  });

  it.each([
    'buyerId',
    'representedEntityId',
    'supportedJobId',
    'capabilityVersion',
    'offerId',
    'offerVersion',
    'priceMinor',
    'currency',
    'cadence',
  ] as const)(
    'cannot borrow %s evidence from another commercial scope',
    field => {
      const context = commercial();
      const evidence = context.evidence.map(item => ({
        ...item,
        scope: {
          ...item.scope,
          [field]: field === 'priceMinor' ? 1 : 'unrelated',
        },
      }));
      const result = qualifySupportedJob(
        input({ commercial: { ...context, evidence } })
      );
      expect(result.commercialDecision.state).toBe('review_needed');
      expect(result.commercialDecision.evidenceIds).toEqual([]);
      expect(result.ranking.rank).toBeNull();
    }
  );

  it.each([
    [
      'stale',
      {
        provenance: {
          ...commercial().evidence[0]!.provenance,
          capturedAt: '2026-01-01T00:00:00Z',
        },
      },
    ],
    [
      'future',
      {
        provenance: {
          ...commercial().evidence[0]!.provenance,
          capturedAt: '2027-01-01T00:00:00Z',
        },
      },
    ],
    [
      'invalid capture',
      {
        provenance: {
          ...commercial().evidence[0]!.provenance,
          capturedAt: 'invalid',
        },
      },
    ],
    ['contradiction', { contradictions: ['buyer disputes amount'] }],
    ['uncertainty', { uncertainty: ['amount unconfirmed'] }],
    ['inference', { basis: 'inferred' }],
    ['inaccessible', { coverage: 'inaccessible' }],
    ['not researched', { coverage: 'not_researched' }],
    ['not found', { coverage: 'not_found_in_coverage' }],
    ['missing confidence basis', { confidenceBasis: '' }],
  ] satisfies [string, Partial<CommercialEvidence>][])(
    'holds %s commercial evidence without calling the buyer unable to pay',
    (_name, patch) => {
      const context = commercial();
      const result = qualifySupportedJob(
        input({
          commercial: {
            ...context,
            evidence: context.evidence.map(item => ({ ...item, ...patch })),
          },
        })
      );
      expect(result.commercialDecision).toMatchObject({
        state: 'review_needed',
        evidenceIds: [],
      });
      expect(result.ranking.rank).toBeNull();
      expect(result.ranking.unknowns).toContain('budget_unknown');
    }
  );

  it.each(['budget', 'authority', 'commitment'] as const)(
    'requires %s even when an offer was exposed or tools were paid',
    dimension => {
      const context = commercial();
      const result = qualifySupportedJob(
        input({
          commercial: {
            ...context,
            evidence: context.evidence.filter(
              item => item.observedFact.dimension !== dimension
            ),
          },
        })
      );
      expect(result.commercialDecision.reasons).toContain(
        `${dimension}_unknown`
      );
      expect(result.ranking.rank).toBeNull();
    }
  );

  it('keeps contradictory amount and negative commitment inspectable', () => {
    const context = commercial();
    const result = qualifySupportedJob(
      input({
        commercial: {
          ...context,
          evidence: [
            ...context.evidence,
            {
              ...context.evidence[0]!,
              id: 'conflicting-budget',
              observedFact: { dimension: 'budget', availableMinor: 100 },
            },
            {
              ...context.evidence[2]!,
              id: 'refused-offer',
              observedFact: { dimension: 'commitment', accepted: false },
            },
          ],
        },
      })
    );
    expect(result.commercialDecision.reasons).toEqual(
      expect.arrayContaining(['budget_unknown', 'commitment_unknown'])
    );
    expect(result.ranking.rank).toBeNull();
  });

  it.each([
    [
      'unknown delivery cost',
      { costs: { ...commercial().costs, deliveryMinor: null } },
      'cost_unknown',
    ],
    [
      'unknown action budget',
      { reservedActionBudgetMinor: null },
      'action_budget_unknown',
    ],
    [
      'unknown research budget',
      { researchBudgetRemainingMinor: null },
      'research_budget_unknown',
    ],
    [
      'research exhausted',
      { researchBudgetRemainingMinor: 0 },
      'budget_exhausted',
    ],
    ['action exhausted', { reservedActionBudgetMinor: 0 }, 'budget_exhausted'],
  ] as const)('holds %s with no assumed zero cost', (_name, patch, reason) => {
    const context = commercial();
    const needsResearch =
      reason === 'research_budget_unknown' || _name === 'research exhausted';
    const result = qualifySupportedJob(
      input({
        commercial: {
          ...context,
          ...patch,
          evidence: needsResearch
            ? context.evidence.filter(
                item => item.observedFact.dimension !== 'budget'
              )
            : context.evidence,
        },
      })
    );
    expect(result.ranking.rank).toBeNull();
    expect(result.ranking.reasons).toContain(reason);
  });

  it('does not authorize outbound or rank through a missing permission gate', () => {
    const result = qualifySupportedJob(
      input({ commercial: commercial(), channelEligibility: [] })
    );
    expect(result.ranking).toMatchObject({
      rank: null,
      band: 'blocked',
      nextAction: 'hold',
      requiredApprovals: ['tim_outbound_approval'],
    });
    expect(result.ranking.reasons).toContain('no_contact_eligible_channel');
  });

  it('routes manager-only represented buyers without global disqualification', () => {
    const result = qualifySupportedJob(
      input({
        identity: {
          ...input().identity,
          roles: ['manager'],
          representsIdentityIds: ['artist-2'],
        },
        commercial: commercial(),
      })
    );
    expect(result.evidenceDecision.state).toBe('pass');
    expect(result.overallDecision.state).toBe('review_needed');
    expect(result.ranking.nextAction).toBe('resolve_buyer');
  });

  it('ranks non-urgent commitment below a deadline without requiring prior spend', () => {
    const context = commercial();
    const result = qualifySupportedJob(
      input({
        tools: [],
        commercial: {
          ...context,
          evidence: context.evidence.filter(
            item => item.observedFact.dimension !== 'urgency'
          ),
        },
      })
    );
    expect(result.commercialDecision.state).toBe('pass');
    expect(result.ranking).toMatchObject({
      band: 'ready',
      rank: 1,
      costs: context.costs,
    });
  });

  it('holds decisions outside their time window', () => {
    const result = qualifySupportedJob(
      input({ commercial: commercial(), now: '2026-10-04T06:00:00.000Z' })
    );
    expect(result.commercialDecision.reasons).toContain(
      'decision_window_inactive'
    );
    expect(result.ranking.rank).toBeNull();
  });

  it('replays identical commercial evidence deterministically and freezes changed decisions separately', () => {
    const context = commercial();
    const original = input({ commercial: context });
    const reordered = input({
      commercial: {
        ...context,
        evidence: [...context.evidence].reverse(),
        needs: [...context.needs].reverse(),
        capabilities: [...context.capabilities].reverse(),
      },
    });
    const first = qualifySupportedJob(original);
    const replay = qualifySupportedJob(reordered);
    expect(replay.ranking).toEqual(first.ranking);
    expect(replay.decisionSnapshotKey).toBe(first.decisionSnapshotKey);
    expect(rankCustomer(original)).toEqual(first.ranking);
    expect(
      qualifySupportedJob(
        input({ ...original, now: '2026-09-28T05:00:00.000Z' })
      ).decisionSnapshotKey
    ).not.toBe(first.decisionSnapshotKey);
    expect(
      qualifySupportedJob(
        input({
          ...original,
          commercial: {
            ...context,
            scope: { ...context.scope, priceMinor: 9900 },
          },
        })
      ).decisionSnapshotKey
    ).not.toBe(first.decisionSnapshotKey);
    expect(
      qualifySupportedJob(
        input({
          ...original,
          observations: [{ ...original.observations[0]!, confidence: 0.2 }],
        })
      ).decisionSnapshotKey
    ).not.toBe(first.decisionSnapshotKey);
    expect(context.evidence[0]!.id).toBe('commercial-budget');
  });

  it.each(['budget', 'authority', 'commitment'] as const)(
    'keeps explicit negative %s separate from missing evidence',
    dimension => {
      const context = commercial();
      const negative: CommercialEvidence['observedFact'] =
        dimension === 'budget'
          ? { dimension, availableMinor: 1 }
          : dimension === 'authority'
            ? { dimension, authorized: false }
            : { dimension, accepted: false };
      const result = qualifySupportedJob(
        input({
          commercial: {
            ...context,
            evidence: context.evidence.map(item =>
              item.observedFact.dimension === dimension
                ? { ...item, observedFact: negative }
                : item
            ),
          },
        })
      );
      expect(result.commercialDecision.reasons).toContain(
        `${dimension}_negative`
      );
      expect(result.ranking.rank).toBeNull();
    }
  );

  it('keeps invalid numeric budget evidence operationally unknown and preserves its receipt', () => {
    const context = commercial();
    const evidence: CommercialEvidence[] = [
      {
        ...context.evidence[0]!,
        observedFact: { dimension: 'budget', availableMinor: Number.NaN },
      },
      ...context.evidence.slice(1),
    ];
    const result = qualifySupportedJob(
      input({ commercial: { ...context, evidence } })
    );
    expect(result.commercialDecision.abilityAtPrice).toBe('unknown');
    expect(result.commercialDecision.excludedEvidenceIds).toEqual([
      'commercial-budget',
    ]);
    expect(result.commercialContext?.evidence).toEqual(evidence);
  });

  it('holds a forged permission pass without observed permission evidence', () => {
    const result = qualifySupportedJob(
      input({
        commercial: commercial(),
        channelEligibility: [
          {
            channel: 'email',
            decision: 'pass',
            permissionEvidenceIds: [],
            reasons: [],
          },
        ],
      })
    );
    expect(result.ranking).toMatchObject({
      rank: null,
      nextAction: 'hold',
      band: 'blocked',
    });
  });

  it('does not pass overall readiness while a must-sell capability is held', () => {
    const result = qualifySupportedJob(
      input({ commercial: { ...commercial(), capabilities: [] } })
    );
    expect(result.commercialDecision).toMatchObject({
      abilityAtPrice: 'yes',
      purchaseAuthority: 'yes',
      offerCommitment: 'yes',
    });
    expect(result.overallDecision.state).toBe('review_needed');
    expect(result.ranking.heldFor).toEqual(['public-profile-pages']);
  });

  it('stops research when the decision is already supported instead of spending to fill columns', () => {
    const result = qualifySupportedJob(
      input({
        commercial: { ...commercial(), researchBudgetRemainingMinor: 0 },
      })
    );
    expect(result.ranking).toMatchObject({
      rank: 2,
      nextAction: 'request_outbound_approval',
      researchBudgetRemainingMinor: 0,
    });
  });

  it('does not rank a buyer with zero deliverable fit even when all needs are optional', () => {
    const result = qualifySupportedJob(
      input({
        commercial: {
          ...commercial(),
          needs: [{ featureId: 'unavailable-capability', mustSell: false }],
        },
      })
    );
    expect(result.ranking).toMatchObject({ rank: null, fitScore: 0 });
    expect(result.ranking.reasons).toContain('no_supported_need');
  });
});
