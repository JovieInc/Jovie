import { describe, expect, it } from 'vitest';
import * as acq from '@/lib/acquisition';

const ready = {
  displayName: 'Ada North',
  avatarUrl: 'https://cdn.example/ada.jpg',
  hasSpotifyLink: true,
  contactEmail: 'ada@example.com',
  instagramHandle: null,
  fitScore: 72,
};

describe('launch acquisition kernel', () => {
  it('runs one shared certify-and-measure loop for both experiments', () => {
    expect(
      acq.canTransitionAcquisitionState('rejected', 'rebuild_waiting')
    ).toBe(true);
    expect(
      acq.applyAcquisitionTransition({
        from: 'human_review',
        to: 'human_review',
      }).idempotent
    ).toBe(true);
    expect(acq.ACQUISITION_EXPERIMENT_IDS).toHaveLength(2);
    expect(
      acq.getAcquisitionExperiment(acq.PREMADE_ARTIST_PROFILE_EXPERIMENT_ID)
        .finalDmSend
    ).toBe('human');
    expect(acq.gapStatusCounts().obsolete_duplicative).toBe(0);
    expect(
      acq.ACQUISITION_GAP_MAP.some(entry =>
        entry.owner.includes('jovie.certification/v1')
      )
    ).toBe(true);
    expect(acq.machineCertifyPremadeProfile(ready).passed).toBe(true);
    expect(
      acq.machineCertifyYouTubeGrowth({
        channelId: 'UC1',
        channelTitle: 'Ada',
        videoCount: 3,
        generatedCount: 2,
        mode: 'before_after',
      }).passed
    ).toBe(true);
    const packet = acq.buildAcquisitionReviewPacket({
      experimentId: acq.PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
      state: 'human_review',
      displayName: 'Ada North',
      claimOrApplyPath: '/claim/token-1',
      machineCertification: acq.machineCertifyPremadeProfile(ready),
    });
    expect(packet.actions).toEqual(acq.ACQUISITION_REVIEW_ACTIONS);
    const rejection = acq.captureAcquisitionRejection({
      candidateId: 'lead-9',
      experimentId: acq.YOUTUBE_GROWTH_EXPERIMENT_ID,
      reason: 'missing_product_capability',
      capability: 'youtube apply',
    });
    const issue = acq.buildProductGapIssue(rejection);
    if (!issue) throw new Error('expected product-gap issue');
    expect(acq.dedupeProductGapIssue([issue.key], issue).action).toBe('reuse');
    expect(
      acq.resolveInboundAcquisition({
        experimentId: acq.PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
        certifiedMatch: {
          candidateId: 'lead-1',
          experimentId: acq.PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
          state: 'outreach_ready',
          claimOrApplyPath: '/claim/token-1',
        },
      }).action
    ).toBe('claim');
    expect(
      acq.projectLeadState({
        status: 'ingested',
        outreachRoute: 'manual_review',
        creatorProfileId: 'p1',
      })
    ).toBe('human_review');
    const report = acq.segmentAcquisitionFunnel([
      {
        experimentId: acq.PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
        eventType: acq.ACQUISITION_FUNNEL_EVENTS.DISCOVERED,
      },
      {
        experimentId: acq.PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
        eventType: 'paid_converted',
      },
    ]);
    expect(report.totals.converted).toBe(1);
    expect(
      acq.LAUNCH_ACQUISITION_OPTIMIZATION_CONTRACT.decisionWriteback
    ).toMatch(/JOV-5911/);
  });
});
