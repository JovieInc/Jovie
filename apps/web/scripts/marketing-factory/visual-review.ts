/**
 * Factory visual review (JOV-7282): sends the render stage's screenshots
 * through the design-ci-judge-dispatch vision judges (art-evaluator on the
 * subscription CLIs, classifier-first) and turns the render captures and
 * the verdict into the digest-bound `MarketingGateReceipt`s that
 * `auditMarketingTasteAdmission` reads for its visual gates.
 *
 * A judge from the producer's model family is rejected outright. With no
 * reachable judge the review is `credentials-unavailable` and no
 * visual-review receipt exists, so admission stays blocked.
 */

import type { JudgeTransport } from '@jovie/copy';
import { modelFamily } from '@jovie/copy';
import {
  auditMarketingTasteAdmission,
  MARKETING_VISUAL_REVIEW_COLOR_CONTRACT,
  type MarketingGateReceipt,
  type MarketingGenerationFinding,
  type MarketingTasteGateId,
} from '../../data/marketing/generation';
import {
  type ArtEvaluatorModule,
  type JudgeScore,
  pickRoleModel,
  type RouteJudges,
  runClassifierFirst,
  type VisionTransport,
  visionAvailability,
  visionJudge,
} from '../design-ci-judge-dispatch';
import type {
  CertifiableUnit,
  RoutedInvariantRow,
} from '../design-ci-judge-router';
import type { Unavailable } from './providers';
import {
  evaluateRenderCaptures,
  type RenderCapture,
  sha256Digest,
} from './render-measurer';

/** The taste gates the render and visual review stages own. */
export const VISUAL_TASTE_GATE_IDS = [
  'responsive-accessibility',
  'visual-review',
] as const satisfies readonly MarketingTasteGateId[];

export interface VisualReviewRequest {
  readonly pageId: string;
  readonly captures: readonly RenderCapture[];
  /** The model that produced the page; the judge must be another family. */
  readonly producerModel: string;
}

export interface VisualReview {
  readonly status: 'reviewed';
  /** The judge whose verdict decided the review (the flagship when escalated). */
  readonly judgeModel: string;
  readonly verdict: 'pass' | 'fail';
  readonly score: number;
  readonly findings: readonly string[];
  readonly judges: readonly JudgeScore[];
}

export type VisualReviewOutcome = VisualReview | Unavailable;

export const VISUAL_REVIEW_ROW: RoutedInvariantRow = {
  rowId: 'factory-visual-review',
  invariantId: 'factory-visual-review',
  ruleId: null,
  title: 'Marketing page reads as one premium, uncluttered Jovie page',
  products: ['web'],
  surfaces: ['marketing'],
  route: 'visual',
  routeEvidence: ['apps/web/scripts/marketing-factory/visual-review.ts'],
  policyFingerprintSource: {
    rule: 'One dominant focal point per section, no competing heroes, no clipped or stranded text, consistent alignment, no stock imagery.',
    color: MARKETING_VISUAL_REVIEW_COLOR_CONTRACT.promptBlock,
  },
};

export function visualReviewUnit(pageId: string): CertifiableUnit {
  return {
    id: `factory:${pageId}`,
    kind: 'screen',
    sourceId: pageId,
    sources: [],
    products: ['web'],
    surfaceTags: ['marketing'],
  };
}

/** Null when the judge may review; a finding when it shares the producer's family. */
export function sameFamilyFinding(
  judgeModel: string,
  producerModel: string
): string | null {
  if (!producerModel) return null;
  // Dry runs label models `fixture:<id>`; the family is the id's.
  const family = (model: string) =>
    modelFamily(model.replace(/^fixture:/u, ''));
  return family(judgeModel) === family(producerModel)
    ? `judge ${judgeModel} shares the ${family(producerModel)} family with producer ${producerModel}`
    : null;
}

/**
 * Judges every viewport screenshot. The review passes only when every
 * viewport passes; any undecided viewport makes the whole review
 * unavailable rather than a partial pass.
 */
export async function runVisualReview(
  request: VisualReviewRequest,
  judges: RouteJudges
): Promise<VisualReviewOutcome> {
  if (judges.cheap.id === null) {
    return {
      status: 'credentials-unavailable',
      reason: 'no cross-family vision judge is reachable from this machine',
    };
  }
  for (const judge of [judges.cheap.id, judges.flagship.id]) {
    const finding = judge && sameFamilyFinding(judge, request.producerModel);
    if (finding) {
      return {
        status: 'reviewed',
        judgeModel: judge,
        verdict: 'fail',
        score: 0,
        findings: [`same-family-judge: ${finding}`],
        judges: [],
      };
    }
  }
  if (request.captures.length === 0) {
    return {
      status: 'credentials-unavailable',
      reason: 'no rendered screenshots to review',
    };
  }
  const unit = visualReviewUnit(request.pageId);
  const decisions = [];
  for (const capture of request.captures) {
    const decision = await runClassifierFirst(
      {
        row: VISUAL_REVIEW_ROW,
        unit,
        cellId: `factory-visual-review::${request.pageId}@${capture.width}`,
        text: null,
        capture: capture.screenshot.path,
      },
      judges,
      () => true
    );
    if (decision.state === 'insufficient') {
      return {
        status: 'credentials-unavailable',
        reason: `visual review at ${capture.width} undecided: ${decision.reason ?? 'no verdict'}`,
      };
    }
    decisions.push({ capture, decision });
  }
  const all = decisions.flatMap(({ decision }) => decision.judges);
  // Each viewport is decided by its last judge (the flagship when that
  // viewport escalated). A failing viewport's decider names the review.
  const deciders = decisions.map(({ decision }) => ({
    state: decision.state,
    judge: decision.judges.at(-1),
  }));
  const decisive =
    deciders.find(({ state }) => state === 'fail') ??
    deciders.find(({ judge }) => judge?.judge !== judges.cheap.id) ??
    deciders[0];
  return {
    status: 'reviewed',
    judgeModel: decisive?.judge?.judge ?? judges.cheap.id,
    verdict: decisions.every(({ decision }) => decision.state === 'pass')
      ? 'pass'
      : 'fail',
    score: Math.min(...deciders.map(({ judge }) => judge?.score ?? 0)),
    findings: decisions
      .filter(({ decision }) => decision.state === 'fail')
      .flatMap(({ capture, decision }) =>
        decision.judges.map(
          judge => `${capture.viewport}@${capture.width}: ${judge.notes}`
        )
      ),
    judges: all,
  };
}

/** Binds a receipt to the exact screenshots it saw. */
function executionIdOf(parts: readonly string[]): string {
  return sha256Digest(parts.join('\n'));
}

/**
 * The visual taste-gate receipts for one candidate. `responsive-accessibility`
 * is deterministic from the captures; `visual-review` exists only when a
 * cross-family judge actually reviewed the screenshots.
 */
export function buildVisualGateReceipts(input: {
  readonly candidateDigest: string;
  readonly captures: readonly RenderCapture[];
  readonly review: VisualReviewOutcome;
  readonly producerModel: string;
}): MarketingGateReceipt[] {
  const shots = input.captures.map(capture => capture.screenshot.digest);
  const responsive = evaluateRenderCaptures(input.captures).filter(
    check => !/^render-(cls|lcp):/u.test(check.id)
  );
  const receipts: MarketingGateReceipt[] = [
    {
      gateId: 'responsive-accessibility',
      verdict:
        input.captures.length > 0 && responsive.every(check => check.ok)
          ? 'pass'
          : 'fail',
      executionId: executionIdOf(['render-measurer', ...shots]),
      candidateDigest: input.candidateDigest,
      findings: responsive
        .filter(check => !check.ok)
        .map(check => check.message),
    },
  ];
  const review = input.review;
  if (review.status === 'reviewed') {
    const sameFamily = sameFamilyFinding(
      review.judgeModel,
      input.producerModel
    );
    const flagged = review.findings.some(finding =>
      finding.startsWith('same-family-judge:')
    );
    receipts.push({
      gateId: 'visual-review',
      verdict: review.verdict === 'pass' && !sameFamily ? 'pass' : 'fail',
      executionId: executionIdOf([review.judgeModel, ...shots]),
      candidateDigest: input.candidateDigest,
      reviewerModelId: review.judgeModel,
      findings: [
        ...review.findings,
        ...(sameFamily && !flagged ? [`same-family-judge: ${sameFamily}`] : []),
      ],
    });
  }
  return receipts;
}

/** `auditMarketingTasteAdmission` scoped to the visual gates. */
export function auditVisualAdmission(input: {
  readonly candidateDigest: string;
  readonly generatorModelId: string;
  readonly receipts: readonly MarketingGateReceipt[];
}): readonly MarketingGenerationFinding[] {
  return auditMarketingTasteAdmission({
    ...input,
    gateIds: VISUAL_TASTE_GATE_IDS,
  });
}

/**
 * Live vision judges, mirroring design-ci-judge-dispatch buildLiveJudges:
 * the cheap judge excludes the producer family, the flagship excludes the
 * cheap judge's family. Unreachable models leave the id null.
 */
type LoadArtEvaluator = () => Promise<
  ArtEvaluatorModule & { subscriptionVisionTransport(): VisionTransport }
>;

const loadLiveArtEvaluator: LoadArtEvaluator = async () =>
  (await import(
    '../../../../scripts/vision/art-evaluator.mjs'
  )) as unknown as ArtEvaluatorModule & {
    subscriptionVisionTransport(): VisionTransport;
  };

/** One named live vision judge, for judge-calibration.ts. */
export async function liveVisionJudge(
  transport: JudgeTransport | null,
  model: string,
  loadArtEvaluator: LoadArtEvaluator = loadLiveArtEvaluator
) {
  const reachable = transport?.available?.(model) ?? false;
  const art = await loadArtEvaluator();
  return visionJudge({
    module: art,
    transport: art.subscriptionVisionTransport(),
    model: reachable ? model : null,
  });
}

/**
 * `failedCalibration`: judges the latest judge-calibration receipt failed;
 * they are never seated.
 */
export async function liveVisualJudges(
  transport: JudgeTransport | null,
  producerModel: string,
  failedCalibration: ReadonlySet<string> = new Set(),
  loadArtEvaluator: LoadArtEvaluator = loadLiveArtEvaluator
): Promise<RouteJudges> {
  const reachable = transport?.available ?? (() => false);
  const available = visionAvailability(
    model => !failedCalibration.has(model) && reachable(model)
  );
  const cheap = pickRoleModel('vision-judge', {
    available,
    modality: 'vision',
    excludeFamilyOf: producerModel,
  });
  const flagship = pickRoleModel('judge-flagship', {
    available,
    modality: 'vision',
    excludeFamilyOf: cheap,
  });
  if (!cheap) {
    const none = {
      id: null,
      run: () => Promise.reject(new Error('no reachable vision judge')),
    };
    return { cheap: none, flagship: none };
  }
  const art = await loadArtEvaluator();
  const vision = art.subscriptionVisionTransport();
  return {
    cheap: visionJudge({ module: art, transport: vision, model: cheap }),
    flagship: visionJudge({ module: art, transport: vision, model: flagship }),
  };
}
