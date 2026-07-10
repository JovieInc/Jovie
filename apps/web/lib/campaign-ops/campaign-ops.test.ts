import { describe, expect, it } from 'vitest';
import {
  APPROVAL_STEP_ORDER,
  buildApprovalIdempotencyKey,
  buildCampaignHealthSnapshot,
  buildCampaignRecommendations,
  buildProductPageKey,
  buildSignalDedupeKey,
  buildTaskDedupeKey,
  canTransitionDrop,
  collapseSignalsToOpportunities,
  computeExpectedOrders,
  computeExpectedRevenueCents,
  createDraftDrop,
  createReleaseWorkflow,
  DEFAULT_SINGLE_RELEASE_PLAYBOOK,
  DEMO_PRODUCT_ASSUMPTIONS,
  detectOpportunitiesFromSignals,
  evaluateSegmentMember,
  importReleasePlaybook,
  markStepFailed,
  markStepSucceeded,
  normalizeExternalSignal,
  pauseMonitoring,
  previewSegment,
  recommendNextMoves,
  resumeMonitoring,
  retryFailedStep,
  runApprovalSteps,
  startOrResumeApproval,
  transitionDrop,
  upsertDraftDrop,
  WARM_TRANCE_SEGMENT,
  workflowHasHiddenInconsistency,
} from './index';
import type { ExternalSignalInput, FanActivityRecord } from './types';

const NOW = new Date('2026-05-15T12:00:00.000Z');

const EDC_COSMIC_GATE_SIGNALS: ExternalSignalInput[] = [
  {
    sourceKind: 'event_festival',
    sourceUrl: 'https://electricdaisycarnival.com/las-vegas/lineup/cosmic-gate',
    sourceLabel: 'EDC Las Vegas lineup',
    artistId: 'artist_tim_white',
    artistName: 'Tim White',
    collaboratorId: 'artist_cosmic_gate',
    collaboratorName: 'Cosmic Gate',
    eventName: 'EDC Las Vegas',
    venue: 'Las Vegas Motor Speedway',
    city: 'Las Vegas',
    startsAt: '2026-05-16T00:00:00.000Z',
    endsAt: '2026-05-18T12:00:00.000Z',
    observedAt: '2026-05-14T08:00:00.000Z',
    confidence: 0.92,
    expiryAt: '2026-05-19T00:00:00.000Z',
    tags: ['festival', 'trance'],
  },
  // Duplicate observation same weekend — must collapse.
  {
    sourceKind: 'event_festival',
    sourceUrl: 'https://example.com/mirror/edc-cosmic-gate',
    sourceLabel: 'EDC mirror feed',
    artistId: 'artist_tim_white',
    artistName: 'Tim White',
    collaboratorId: 'artist_cosmic_gate',
    collaboratorName: 'Cosmic Gate',
    eventName: 'EDC Las Vegas',
    city: 'Las Vegas',
    startsAt: '2026-05-16T02:00:00.000Z',
    observedAt: '2026-05-14T10:00:00.000Z',
    confidence: 0.8,
    expiryAt: '2026-05-19T00:00:00.000Z',
  },
  {
    sourceKind: 'commerce_window',
    sourceUrl: 'https://www.amazon.com/primeday',
    sourceLabel: 'June Prime Day commerce window',
    artistId: 'artist_tim_white',
    artistName: 'Tim White',
    eventName: 'Prime Day',
    startsAt: '2026-06-01T00:00:00.000Z',
    endsAt: '2026-06-03T00:00:00.000Z',
    observedAt: '2026-05-10T00:00:00.000Z',
    confidence: 0.7,
    expiryAt: '2026-06-04T00:00:00.000Z',
  },
];

const FAN_FIXTURES: FanActivityRecord[] = [
  {
    memberId: 'fan_1',
    eventType: 'link_clicked',
    genreTags: ['trance'],
    linkClickCount: 3,
    isBuyer: true,
    isSubscriber: true,
    lastActiveAt: '2026-05-10T00:00:00.000Z',
  },
  {
    memberId: 'fan_2',
    eventType: 'link_clicked',
    genreTags: ['trance', 'edm'],
    linkClickCount: 1,
    isSubscriber: true,
    lastActiveAt: '2026-05-12T00:00:00.000Z',
  },
  {
    memberId: 'fan_3',
    eventType: 'profile_visited',
    genreTags: ['hip-hop'],
    linkClickCount: 5,
    lastActiveAt: '2026-05-01T00:00:00.000Z',
  },
  {
    memberId: 'fan_4',
    eventType: 'link_clicked',
    // missing genre tags
    linkClickCount: 2,
    lastActiveAt: '2026-05-14T00:00:00.000Z',
  },
  {
    memberId: 'fan_stale',
    eventType: 'link_clicked',
    genreTags: ['trance'],
    linkClickCount: 4,
    lastActiveAt: '2025-01-01T00:00:00.000Z',
  },
];

describe('external opportunity detector (JOV-2205)', () => {
  it('normalizes signals with source URL, timestamp, confidence, and expiry', () => {
    const normalized = normalizeExternalSignal(EDC_COSMIC_GATE_SIGNALS[0]!);
    expect(normalized.sourceUrl).toContain('electricdaisycarnival');
    expect(normalized.observedAt).toBe('2026-05-14T08:00:00.000Z');
    expect(normalized.confidence).toBe(0.92);
    expect(normalized.expiryAt).toBe('2026-05-19T00:00:00.000Z');
    expect(normalized.dedupeKey).toContain('event_festival');
  });

  it('collapses duplicate EDC/Cosmic Gate signals into one opportunity', () => {
    const opportunities = detectOpportunitiesFromSignals(
      EDC_COSMIC_GATE_SIGNALS,
      { now: NOW, artistId: 'artist_tim_white' }
    );

    const edc = opportunities.filter(o => o.title.includes('Cosmic Gate'));
    expect(edc).toHaveLength(1);
    expect(edc[0]!.signalIds.length).toBe(2);
    expect(edc[0]!.sourceUrls.length).toBe(2);
    expect(edc[0]!.collaboratorName).toBe('Cosmic Gate');
    expect(edc[0]!.rankScore).toBeGreaterThan(0);
  });

  it('uses stable dedupe keys per artist/collaborator/day window', () => {
    const a = buildSignalDedupeKey({
      artistId: 'artist_tim_white',
      collaboratorId: 'artist_cosmic_gate',
      sourceKind: 'event_festival',
      startsAt: '2026-05-16T00:00:00.000Z',
      eventName: 'EDC Las Vegas',
    });
    const b = buildSignalDedupeKey({
      artistId: 'artist_tim_white',
      collaboratorId: 'artist_cosmic_gate',
      sourceKind: 'event_festival',
      startsAt: '2026-05-16T23:00:00.000Z',
      eventName: 'EDC Las Vegas',
    });
    expect(a).toBe(b);
  });

  it('drops expired signals and ranks fresher windows higher', () => {
    const expired: ExternalSignalInput = {
      ...EDC_COSMIC_GATE_SIGNALS[0]!,
      observedAt: '2026-01-01T00:00:00.000Z',
      expiryAt: '2026-01-02T00:00:00.000Z',
      startsAt: '2026-01-01T00:00:00.000Z',
      eventName: 'Ancient Festival',
      collaboratorId: 'old',
      collaboratorName: 'Old Act',
    };
    const opportunities = detectOpportunitiesFromSignals(
      [...EDC_COSMIC_GATE_SIGNALS, expired],
      { now: NOW }
    );
    expect(opportunities.every(o => !o.title.includes('Ancient'))).toBe(true);
    expect(opportunities[0]!.title).toContain('Cosmic Gate');
  });

  it('collapse helper accepts already-normalized signals', () => {
    const normalized = EDC_COSMIC_GATE_SIGNALS.map(normalizeExternalSignal);
    const opportunities = collapseSignalsToOpportunities(normalized, {
      now: NOW,
    });
    expect(opportunities.length).toBeGreaterThanOrEqual(2);
  });
});

describe('fan segment builder (JOV-2207)', () => {
  it('matches genre + link activity + recency predicates', () => {
    const match = evaluateSegmentMember(
      FAN_FIXTURES[0]!,
      WARM_TRANCE_SEGMENT,
      NOW
    );
    expect(match.matches).toBe(true);
    expect(match.dimensions).toEqual(
      expect.arrayContaining(['genre_affinity', 'link_activity', 'recency'])
    );
  });

  it('excludes wrong genre and stale activity', () => {
    expect(
      evaluateSegmentMember(FAN_FIXTURES[2]!, WARM_TRANCE_SEGMENT, NOW).matches
    ).toBe(false);
    expect(
      evaluateSegmentMember(FAN_FIXTURES[4]!, WARM_TRANCE_SEGMENT, NOW).matches
    ).toBe(false);
  });

  it('previews segment size, samples, and missing-data notes', () => {
    const preview = previewSegment(WARM_TRANCE_SEGMENT, FAN_FIXTURES, {
      now: NOW,
      sampleSize: 5,
    });
    expect(preview.size).toBe(2); // fan_1, fan_2
    expect(preview.sampleMembers.map(m => m.memberId).sort()).toEqual([
      'fan_1',
      'fan_2',
    ]);
    expect(
      preview.missingDataNotes.some(n => n.includes('genre affinity'))
    ).toBe(true);
    expect(preview.definitionId).toBe(WARM_TRANCE_SEGMENT.id);
  });
});

describe('campaign recommendation engine (JOV-2208)', () => {
  it('computes deterministic revenue math', () => {
    // 5260 * 0.05 = 263 orders × $38 = $9,994
    const orders = computeExpectedOrders(5260, 0.05);
    expect(orders).toBe(263);
    expect(computeExpectedRevenueCents(orders, 3800)).toBe(999_400);
  });

  it('returns ranked multi-product recommendations with assumptions', () => {
    const opportunities = detectOpportunitiesFromSignals(
      EDC_COSMIC_GATE_SIGNALS,
      { now: NOW }
    );
    const opportunity = opportunities.find(o =>
      o.title.includes('Cosmic Gate')
    )!;
    const result = buildCampaignRecommendations({
      opportunity,
      segmentSize: 5260,
      segmentName: WARM_TRANCE_SEGMENT.name,
      products: DEMO_PRODUCT_ASSUMPTIONS,
      channels: ['jovie_link', 'email', 'sms'],
      windowHours: 72,
      now: NOW.toISOString(),
    });

    expect(result.options).toHaveLength(3);
    expect(result.options[0]!.productLabel).toContain('Festival Tee');
    expect(result.options[0]!.expectedOrders).toBe(263);
    expect(result.options[0]!.expectedRevenueCents).toBe(999_400);
    expect(result.options[0]!.whyNow).toMatch(/72-hour/i);
    expect(result.options[0]!.assumptions.length).toBeGreaterThan(3);
    expect(result.options[0]!.confidence).toBeGreaterThan(0);
    // Ranked high to low
    expect(result.options[0]!.rankScore).toBeGreaterThanOrEqual(
      result.options[1]!.rankScore
    );
  });
});

describe('merch/drop creation workflow (JOV-2209)', () => {
  const opportunityStub = {
    id: 'opp_edc',
    kind: 'festival_attention' as const,
    artistId: 'artist_tim_white',
    title: 'Cosmic Gate at EDC Las Vegas',
    why: 'test',
    rankScore: 1,
    confidence: 0.9,
    windowStartsAt: '2026-05-16T00:00:00.000Z',
    windowEndsAt: '2026-05-18T00:00:00.000Z',
    signalIds: [],
    collaboratorId: 'artist_cosmic_gate',
    collaboratorName: 'Cosmic Gate',
    sourceUrls: [],
  };

  it('creates draft drops with product, price, launch window, and owner', () => {
    const rec = buildCampaignRecommendations({
      opportunity: opportunityStub,
      segmentSize: 5260,
      segmentName: 'Warm Trance Fans',
      products: [DEMO_PRODUCT_ASSUMPTIONS[0]!],
      channels: ['jovie_link'],
      windowHours: 72,
      now: NOW.toISOString(),
    });
    const drop = createDraftDrop({
      id: 'drop_1',
      campaignId: 'camp_1',
      ownerProfileId: 'profile_tim',
      option: rec.options[0]!,
      launchStartsAt: '2026-05-16T00:00:00.000Z',
      launchEndsAt: '2026-05-19T00:00:00.000Z',
    });
    expect(drop.state).toBe('draft');
    expect(drop.priceCents).toBe(3800);
    expect(drop.productLabel).toContain('Festival Tee');
    expect(drop.ownerProfileId).toBe('profile_tim');
    expect(drop.productPageKey).toBe(
      buildProductPageKey({
        ownerProfileId: 'profile_tim',
        campaignId: 'camp_1',
        productSku: 'deep-end-festival-tee',
      })
    );
  });

  it('is idempotent on product page key and supports draft→preview→scheduled', () => {
    const rec = buildCampaignRecommendations({
      opportunity: opportunityStub,
      segmentSize: 100,
      segmentName: 'Warm Trance Fans',
      products: [DEMO_PRODUCT_ASSUMPTIONS[0]!],
      channels: ['jovie_link'],
      windowHours: 72,
    });
    const input = {
      id: 'drop_1',
      campaignId: 'camp_1',
      ownerProfileId: 'profile_tim',
      option: rec.options[0]!,
      launchStartsAt: '2026-05-16T00:00:00.000Z',
      launchEndsAt: '2026-05-19T00:00:00.000Z',
    };
    const first = upsertDraftDrop([], input);
    const second = upsertDraftDrop([first.drop], { ...input, id: 'drop_2' });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.drop.id).toBe('drop_1');

    expect(canTransitionDrop('draft', 'preview_ready')).toBe(true);
    const previewed = transitionDrop(first.drop, 'preview_ready');
    expect(previewed.allowed).toBe(true);
    expect(previewed.drop.previewUrl).toContain('/drop/preview/');
    const scheduled = transitionDrop(previewed.drop, 'scheduled');
    expect(scheduled.allowed).toBe(true);
    expect(scheduled.drop.state).toBe('scheduled');
  });
});

describe('approval orchestrator (JOV-2210)', () => {
  it('starts an idempotent workflow with ordered steps', () => {
    const first = startOrResumeApproval({
      existing: null,
      workflowId: 'wf_1',
      artistId: 'artist_tim_white',
      recommendationId: 'rec_tee',
      now: NOW.toISOString(),
    });
    expect(first.created).toBe(true);
    expect(first.workflow.steps.map(s => s.id)).toEqual([
      ...APPROVAL_STEP_ORDER,
    ]);
    expect(first.workflow.idempotencyKey).toBe(
      buildApprovalIdempotencyKey({
        artistId: 'artist_tim_white',
        recommendationId: 'rec_tee',
      })
    );

    const second = startOrResumeApproval({
      existing: first.workflow,
      workflowId: 'wf_2',
      artistId: 'artist_tim_white',
      recommendationId: 'rec_tee',
    });
    expect(second.created).toBe(false);
    expect(second.workflow.workflowId).toBe('wf_1');
  });

  it('records success/failure/retry and avoids hidden inconsistency on complete', () => {
    const { workflow } = startOrResumeApproval({
      existing: null,
      workflowId: 'wf_1',
      artistId: 'artist_tim_white',
      recommendationId: 'rec_tee',
      now: NOW.toISOString(),
    });

    let current = runApprovalSteps(
      workflow,
      {
        create_campaign: () => ({ ok: true, output: { campaignId: 'c1' } }),
        create_drop: () => ({ ok: false, error: 'printful timeout' }),
        update_smart_link: () => ({ ok: true, output: { linkId: 'l1' } }),
      },
      { now: NOW.toISOString() }
    );

    expect(current.status).toBe('partial');
    expect(current.steps.find(s => s.id === 'create_drop')?.status).toBe(
      'failed'
    );
    // stopOnFailure: later handler not run
    expect(current.steps.find(s => s.id === 'update_smart_link')?.status).toBe(
      'pending'
    );

    current = retryFailedStep(current, 'create_drop', NOW.toISOString());
    current = runApprovalSteps(
      current,
      {
        create_drop: () => ({ ok: true, output: { dropId: 'd1' } }),
        update_smart_link: () => ({ ok: true, output: { linkId: 'l1' } }),
        draft_notifications: () => ({ ok: true, output: { drafts: 1 } }),
        select_audience: () => ({ ok: true, output: { segmentId: 's1' } }),
        create_tasks: () => ({ ok: true, output: { tasks: 4 } }),
        schedule_launch: () => ({ ok: true, output: { scheduled: true } }),
        enable_monitoring: () => ({ ok: true, output: { monitoring: true } }),
      },
      { now: NOW.toISOString() }
    );

    expect(current.status).toBe('completed');
    expect(workflowHasHiddenInconsistency(current)).toBe(false);
    expect(
      current.steps.every(
        s => s.status === 'succeeded' || s.status === 'skipped'
      )
    ).toBe(true);
  });

  it('mark helpers update attempt counts', () => {
    const { workflow } = startOrResumeApproval({
      existing: null,
      workflowId: 'wf_1',
      artistId: 'a',
      recommendationId: 'r',
      now: NOW.toISOString(),
    });
    let current = markStepSucceeded(
      workflow,
      'create_campaign',
      { campaignId: 'c' },
      NOW.toISOString()
    );
    current = markStepFailed(current, 'create_drop', 'boom', NOW.toISOString());
    expect(current.steps.find(s => s.id === 'create_drop')?.error).toBe('boom');
  });
});

describe('campaign monitoring (JOV-2212)', () => {
  it('tracks counters and emits threshold next-moves with evidence', () => {
    const snapshot = buildCampaignHealthSnapshot({
      campaignId: 'camp_1',
      counters: {
        clicks: 100,
        purchases: 1,
        replies: 1,
        optIns: 5,
        channelStatuses: {
          jovie_link: 'ok',
          email: 'degraded',
          sms: 'ok',
          profile: 'ok',
          social: 'ok',
        },
      },
      now: NOW.toISOString(),
    });

    expect(snapshot.conversionRate).toBe(0.01);
    expect(snapshot.status).toBe('watch');

    const moves = recommendNextMoves(snapshot);
    const kinds = moves.map(m => m.kind);
    expect(kinds).toContain('boost_channel');
    expect(kinds).toContain('follow_up_content');
    // Deduped kinds
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const move of moves) {
      expect(move.evidence.length).toBeGreaterThan(0);
      expect(move.expectedImpact.length).toBeGreaterThan(0);
    }
  });

  it('can pause and resume monitoring', () => {
    const live = buildCampaignHealthSnapshot({
      campaignId: 'camp_1',
      counters: {
        clicks: 50,
        purchases: 5,
        replies: 5,
        optIns: 2,
        channelStatuses: {
          jovie_link: 'ok',
          email: 'ok',
          sms: 'ok',
          profile: 'ok',
          social: 'ok',
        },
      },
      now: NOW.toISOString(),
    });
    const paused = pauseMonitoring(live, NOW.toISOString());
    expect(paused.status).toBe('paused');
    expect(recommendNextMoves(paused)).toEqual([]);
    const resumed = resumeMonitoring(paused, NOW.toISOString());
    expect(resumed.paused).toBe(false);
    expect(resumed.status).not.toBe('paused');
  });

  it('recommends extend window on strong conversion', () => {
    const snapshot = buildCampaignHealthSnapshot({
      campaignId: 'camp_hot',
      counters: {
        clicks: 200,
        purchases: 20,
        replies: 40,
        optIns: 15,
        channelStatuses: {
          jovie_link: 'ok',
          email: 'ok',
          sms: 'ok',
          profile: 'ok',
          social: 'ok',
        },
      },
      now: NOW.toISOString(),
    });
    const kinds = recommendNextMoves(snapshot).map(m => m.kind);
    expect(kinds).toContain('extend_window');
    expect(kinds).toContain('close_and_report');
  });
});

describe('release workflow from playbooks (JOV-2213)', () => {
  it('expands a versioned playbook into a canonical workflow', () => {
    const workflow = createReleaseWorkflow({
      id: 'rw_1',
      releaseId: 'rel_deep_end',
      playbook: DEFAULT_SINGLE_RELEASE_PLAYBOOK,
      now: NOW.toISOString(),
    });
    expect(workflow.playbookVersion).toBe('1.0.0');
    expect(workflow.tasks.length).toBe(
      DEFAULT_SINGLE_RELEASE_PLAYBOOK.tasks.length
    );
    expect(workflow.tasks.every(t => t.state === 'pending')).toBe(true);
    expect(workflow.tasks.some(t => t.title.includes('smart link'))).toBe(true);
  });

  it('dedupes tasks across repeated imports', () => {
    const first = importReleasePlaybook({
      existing: null,
      workflowId: 'rw_1',
      releaseId: 'rel_deep_end',
      playbook: DEFAULT_SINGLE_RELEASE_PLAYBOOK,
      now: NOW.toISOString(),
    });
    const second = importReleasePlaybook({
      existing: {
        ...first.workflow,
        tasks: first.workflow.tasks.map((t, i) =>
          i === 0 ? { ...t, state: 'done' as const } : t
        ),
      },
      workflowId: 'rw_2',
      releaseId: 'rel_deep_end',
      playbook: DEFAULT_SINGLE_RELEASE_PLAYBOOK,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.workflow.tasks.length).toBe(first.workflow.tasks.length);
    expect(second.workflow.tasks[0]!.state).toBe('done');
  });

  it('uses stable task dedupe keys', () => {
    const key = buildTaskDedupeKey({
      releaseId: 'rel_deep_end',
      playbookId: 'single-release-v1',
      playbookVersion: '1.0.0',
      title: 'Create Jovie smart link',
    });
    expect(key).toContain('rel-deep-end');
    expect(key).toContain('create-jovie-smart-link');
  });
});

describe('end-to-end Cosmic Gate demo path', () => {
  it('signal → segment → recommendation → drop → approval → monitor', () => {
    const opportunities = detectOpportunitiesFromSignals(
      EDC_COSMIC_GATE_SIGNALS,
      { now: NOW, artistId: 'artist_tim_white' }
    );
    const opportunity = opportunities.find(o =>
      o.title.includes('Cosmic Gate')
    )!;
    expect(opportunity).toBeDefined();

    const segment = previewSegment(WARM_TRANCE_SEGMENT, FAN_FIXTURES, {
      now: NOW,
    });
    expect(segment.size).toBeGreaterThan(0);

    const recs = buildCampaignRecommendations({
      opportunity,
      segmentSize: 5260,
      segmentName: WARM_TRANCE_SEGMENT.name,
      products: DEMO_PRODUCT_ASSUMPTIONS,
      channels: ['jovie_link', 'email'],
      windowHours: 72,
      now: NOW.toISOString(),
    });
    const best = recs.options[0]!;
    expect(best.expectedOrders).toBe(263);

    const { drop } = upsertDraftDrop([], {
      id: 'drop_demo',
      campaignId: 'camp_demo',
      ownerProfileId: 'profile_tim',
      option: best,
      launchStartsAt: opportunity.windowStartsAt,
      launchEndsAt: opportunity.windowEndsAt,
    });
    const previewed = transitionDrop(drop, 'preview_ready');
    expect(previewed.allowed).toBe(true);

    const { workflow } = startOrResumeApproval({
      existing: null,
      workflowId: 'wf_demo',
      artistId: opportunity.artistId,
      recommendationId: best.id,
      now: NOW.toISOString(),
    });
    const finished = runApprovalSteps(
      workflow,
      Object.fromEntries(
        APPROVAL_STEP_ORDER.map(id => [
          id,
          () => ({ ok: true as const, output: { step: id } }),
        ])
      ),
      { now: NOW.toISOString() }
    );
    expect(finished.status).toBe('completed');

    const health = buildCampaignHealthSnapshot({
      campaignId: 'camp_demo',
      counters: {
        clicks: 80,
        purchases: 12,
        replies: 10,
        optIns: 20,
        channelStatuses: {
          jovie_link: 'ok',
          email: 'ok',
          sms: 'ok',
          profile: 'ok',
          social: 'ok',
        },
      },
      now: NOW.toISOString(),
    });
    expect(recommendNextMoves(health).length).toBeGreaterThan(0);
  });
});
