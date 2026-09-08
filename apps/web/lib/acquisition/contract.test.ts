import { describe, expect, it } from 'vitest';
import {
  YOUTUBE_THUMBNAILS_EVENTS,
  YOUTUBE_THUMBNAILS_OPTIMIZATION,
} from '@/data/youtubeThumbnailsCopy';
import {
  ACQUISITION_OPTIMIZATION_SURFACES,
  ACQUISITION_RUN_STATES,
  acquisitionAttribution,
  evaluateAcquisitionDmSend,
  evaluateYoutubeRetargetingAds,
  LAUNCH_EXPERIMENT_IDS,
} from './contract';
import {
  ACQUISITION_GAP_AUDIT,
  assertAuditCoversEveryStage,
  nextAcquisitionPath,
} from './gap-audit';
import {
  YOUTUBE_CLOSED_LOOP_EVENTS,
  YOUTUBE_CLOSED_LOOP_OPTIMIZATION_CONTRACT,
} from './youtube-closed-loop';

describe('acquisition contract (JOV-5911 / JOV-5881)', () => {
  it('registers both experiments and fail-closes send/ads', () => {
    expect(LAUNCH_EXPERIMENT_IDS).toEqual([
      'premade-artist-profile',
      'youtube-closed-loop',
    ]);
    expect(nextAcquisitionPath('youtube-closed-loop').issue).toBe('JOV-5882');
    expect(nextAcquisitionPath('premade-artist-profile').issue).toBe(
      'JOV-5912'
    );
    expect(ACQUISITION_RUN_STATES).toContain('outreach_ready');
    expect(evaluateAcquisitionDmSend().allowed).toBe(false);
    expect(evaluateYoutubeRetargetingAds().allowed).toBe(false);
  });

  it('covers every audit stage and reuses shipped YouTube work', () => {
    expect(assertAuditCoversEveryStage(ACQUISITION_GAP_AUDIT.shared)).toBe(
      true
    );
    expect(
      assertAuditCoversEveryStage(
        ACQUISITION_GAP_AUDIT.experiments['youtube-closed-loop']
      )
    ).toBe(true);
    expect(
      assertAuditCoversEveryStage(
        ACQUISITION_GAP_AUDIT.experiments['premade-artist-profile']
      )
    ).toBe(true);
    const youtube = ACQUISITION_GAP_AUDIT.experiments['youtube-closed-loop'];
    expect(
      youtube.find(row => row.stage === 'identity_resolution')?.status
    ).toBe('production_ready');
    expect(
      youtube.find(row => row.stage === 'data_ingestion')?.evidence
    ).toContain('JOV-3189');
    expect(
      youtube.find(row => row.stage === 'ovi_human_review')?.evidence
    ).toContain('Do not steal');
    expect(nextAcquisitionPath('youtube-closed-loop').reason).toContain(
      'videos.update'
    );
  });

  it('declares JOV-INV-012 on existing analytics surfaces', () => {
    const contract = YOUTUBE_CLOSED_LOOP_OPTIMIZATION_CONTRACT;
    expect(contract.exposure).toBe(YOUTUBE_CLOSED_LOOP_EVENTS.EXPOSED);
    expect(contract.attribution.surfaces).toEqual(
      ACQUISITION_OPTIMIZATION_SURFACES
    );
    expect(contract.primaryMetric).toContain('watch_minutes_per_impression');
    expect(contract.guardrails.join(' ')).toContain('Tim-only');
    expect(
      acquisitionAttribution(
        'youtube-closed-loop',
        contract.variantIdentity,
        'youtube-thumbnails'
      ).campaignKey
    ).toBe('youtube-closed-loop');
    expect(YOUTUBE_THUMBNAILS_EVENTS.EXPOSED).toBe(
      YOUTUBE_CLOSED_LOOP_EVENTS.EXPOSED
    );
    expect(YOUTUBE_THUMBNAILS_OPTIMIZATION.parentVariantIdentity).toBe(
      contract.variantIdentity
    );
  });
});
