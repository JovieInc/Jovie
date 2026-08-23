import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  auditHomepageRedesignPhase1,
  auditHomepageSectionPromotion,
  auditLiveHomepageSource,
  getHomepageIsolatedProposal,
  HOMEPAGE_ASSET_SHOOTOUT,
  HOMEPAGE_BEST_PROPOSAL_ID,
  HOMEPAGE_FOUNDER_DECISION,
  HOMEPAGE_GENERATION_RUN,
  HOMEPAGE_ISOLATED_PROPOSALS,
  HOMEPAGE_LIVE_BASELINE,
  HOMEPAGE_PEN_BASELINE,
  HOMEPAGE_PROPOSAL_NARRATIVE_SOURCE,
  HOMEPAGE_REDESIGN_CONTRACT_VERSION,
  HOMEPAGE_REDESIGN_ISSUE_ID,
  HOMEPAGE_REDESIGN_PHASE,
  HOMEPAGE_REDESIGN_VIEWPORTS,
  LIVE_HOMEPAGE_ROUTE,
  LIVE_HOMEPAGE_SECTION_IDS,
  LIVE_HOMEPAGE_SOURCE_FILES,
  STAGED_HOMEPAGE_SOURCE_FILES,
  START_GOLDEN_PATH_ROUTE,
} from '@/data/marketing';

const repoRoot = path.resolve(__dirname, '../../../../..');
const liveHomepagePath = path.join(repoRoot, 'apps/web/app/(home)/page.tsx');

describe('JOV-5159 homepage redesign founder-review contracts', () => {
  it('keeps live `/` frozen and unbound to isolated proposals', () => {
    const pageSource = readFileSync(liveHomepagePath, 'utf8');

    expect(HOMEPAGE_LIVE_BASELINE.route).toBe(LIVE_HOMEPAGE_ROUTE);
    expect(HOMEPAGE_LIVE_BASELINE.mutationAllowed).toBe(false);
    expect(HOMEPAGE_LIVE_BASELINE.sectionIds).toEqual(
      LIVE_HOMEPAGE_SECTION_IDS
    );
    expect(auditLiveHomepageSource(pageSource)).toEqual([]);
    expect(pageSource).not.toContain('capture-return-v1');
  });

  it('records live and staged source files that still exist', () => {
    for (const relativePath of [
      ...LIVE_HOMEPAGE_SOURCE_FILES,
      ...STAGED_HOMEPAGE_SOURCE_FILES,
      HOMEPAGE_PROPOSAL_NARRATIVE_SOURCE,
    ]) {
      expect(existsSync(path.join(repoRoot, relativePath)), relativePath).toBe(
        true
      );
    }
  });

  it('records a fail-closed Pen baseline without claiming a live canvas mutation', () => {
    expect(HOMEPAGE_PEN_BASELINE.schema).toBe('pen-cold-readback/v2');
    expect(HOMEPAGE_PEN_BASELINE.verdict).toBe('cold_readback_failed');
    expect(HOMEPAGE_PEN_BASELINE.typedReasons).toEqual([
      'safe_cold_manifest_unavailable',
    ]);
    expect(HOMEPAGE_PEN_BASELINE.semanticManifest).toBeNull();
    expect(HOMEPAGE_PEN_BASELINE.semanticManifestComplete).toBe(false);
    expect(HOMEPAGE_PEN_BASELINE.executeInvoked).toBe(false);
    expect(HOMEPAGE_PEN_BASELINE.saveInvoked).toBe(false);
    expect(HOMEPAGE_PEN_BASELINE.documentOpened).toBe(false);
    expect(HOMEPAGE_PEN_BASELINE.liveCanvasMutated).toBe(false);
  });

  it('presents one isolated Capture → Return proposal at desktop and mobile', () => {
    const proposal = getHomepageIsolatedProposal(HOMEPAGE_BEST_PROPOSAL_ID);

    expect(HOMEPAGE_ISOLATED_PROPOSALS).toHaveLength(1);
    expect(proposal.id).toBe('capture-return-v1');
    expect(proposal.status).toBe('isolated');
    expect(proposal.boundRoute).toBeNull();
    expect(proposal.liveCanvasMutated).toBe(false);
    expect(proposal.sourceNarrative).toBe('Capture → Return');
    expect(proposal.firstVisit.action).toBe('Get Their Email Or SMS');
    expect(proposal.returnVisit.action).toBe(
      'Send Them Straight To Your Music'
    );
    expect(proposal.frames.map(frame => frame.viewportId).toSorted()).toEqual([
      'desktop',
      'mobile',
    ]);
    expect(proposal.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          viewportId: 'desktop',
          width: HOMEPAGE_REDESIGN_VIEWPORTS.desktop.width,
          boundRoute: null,
          grayscaleOnly: true,
        }),
        expect.objectContaining({
          viewportId: 'mobile',
          width: HOMEPAGE_REDESIGN_VIEWPORTS.mobile.width,
          boundRoute: null,
          grayscaleOnly: true,
        }),
      ])
    );
  });

  it('versions generation-run, asset-shootout, and founder-decision contracts', () => {
    expect(HOMEPAGE_REDESIGN_CONTRACT_VERSION).toBe('homepage-redesign/v1');
    expect(HOMEPAGE_REDESIGN_ISSUE_ID).toBe('JOV-5159');
    expect(HOMEPAGE_REDESIGN_PHASE).toBe('founder-review');
    expect(HOMEPAGE_GENERATION_RUN.schema).toBe('homepage-generation-run/v1');
    expect(HOMEPAGE_GENERATION_RUN.productionMutation).toBe('forbidden');
    expect(HOMEPAGE_GENERATION_RUN.stages).toEqual([
      'truth',
      'narrative',
      'copy',
      'section-design',
      'asset-generation',
      'adversarial-review',
      'taste-admission',
    ]);
    expect(HOMEPAGE_ASSET_SHOOTOUT.schema).toBe('homepage-asset-shootout/v1');
    expect(HOMEPAGE_ASSET_SHOOTOUT.entries).toHaveLength(2);
    expect(
      HOMEPAGE_ASSET_SHOOTOUT.entries.every(
        entry =>
          entry.winner === 'pending-founder' &&
          entry.proposalBoundRoute === null
      )
    ).toBe(true);
    expect(HOMEPAGE_FOUNDER_DECISION.schema).toBe(
      'homepage-founder-decision/v1'
    );
    expect(HOMEPAGE_FOUNDER_DECISION.status).toBe('pending');
    expect(HOMEPAGE_FOUNDER_DECISION.selectedProposalId).toBe(
      HOMEPAGE_BEST_PROPOSAL_ID
    );
    expect(HOMEPAGE_FOUNDER_DECISION.productionBinding).toBeNull();
    expect(HOMEPAGE_FOUNDER_DECISION.startGoldenPathProof).toBeNull();
    expect(auditHomepageRedesignPhase1()).toEqual([]);
  });

  it('blocks source-section promotion until founder approval and `/start` proof exist', () => {
    expect(
      auditHomepageSectionPromotion({
        sectionId: 'hero',
        proposalId: HOMEPAGE_BEST_PROPOSAL_ID,
        founderDecision: HOMEPAGE_FOUNDER_DECISION,
        sectionApproved: false,
        startGoldenPathProof: null,
        alreadyPromotedSections: [],
        targetRoute: LIVE_HOMEPAGE_ROUTE,
      }).map(finding => finding.code)
    ).toEqual(
      expect.arrayContaining([
        'founder-decision-required',
        'section-approval-required',
        'start-golden-path-required',
      ])
    );

    expect(
      auditHomepageSectionPromotion({
        sectionId: 'hero',
        proposalId: HOMEPAGE_BEST_PROPOSAL_ID,
        founderDecision: {
          ...HOMEPAGE_FOUNDER_DECISION,
          status: 'approved',
        },
        sectionApproved: true,
        startGoldenPathProof: `${START_GOLDEN_PATH_ROUTE}#jov-5159-golden-path`,
        alreadyPromotedSections: ['capture-return'],
        targetRoute: LIVE_HOMEPAGE_ROUTE,
      }).map(finding => finding.code)
    ).toContain('one-section-at-a-time');

    expect(
      auditHomepageSectionPromotion({
        sectionId: 'hero',
        proposalId: HOMEPAGE_BEST_PROPOSAL_ID,
        founderDecision: {
          ...HOMEPAGE_FOUNDER_DECISION,
          status: 'approved',
        },
        sectionApproved: true,
        startGoldenPathProof: `${START_GOLDEN_PATH_ROUTE}#jov-5159-golden-path`,
        alreadyPromotedSections: [],
        targetRoute: LIVE_HOMEPAGE_ROUTE,
      })
    ).toEqual([]);
  });
});
