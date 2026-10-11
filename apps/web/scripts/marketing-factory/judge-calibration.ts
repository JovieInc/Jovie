/**
 * Comparative eval for the factory's vision judges (JOV-7765).
 *
 * `pnpm factory:calibrate-judges --holdout <file> --judges a,b,c`
 *
 * Every candidate judge reviews the same founder-labeled holdout of
 * screenshots (accepted designs = pass, founder-caught escapes = fail). Each
 * judge's agreement with the founder is Cohen's kappa (lib/eval/calibration),
 * and the receipt ranks the judges by it. A judge that misses an item or
 * falls under the threshold fails calibration, and liveVisualJudges never
 * seats a failed judge once a receipt exists.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { routedTransport } from '@jovie/copy/transport';
import {
  computeHoldoutKappa,
  DEFAULT_KAPPA_THRESHOLD,
  type HumanHoldoutSet,
  type JudgeBinaryLabel,
  loadHumanHoldoutSet,
  pairHoldoutLabels,
} from '../../lib/eval/calibration';
import type { StageJudge } from '../design-ci-judge-dispatch';
import { FACTORY_RUNS_DIR, readJson, writeJson } from './receipts';
import {
  liveVisionJudge,
  VISUAL_REVIEW_ROW,
  visualReviewUnit,
} from './visual-review';

export const JUDGE_CALIBRATION_SCHEMA = 'jovie.factory-judge-calibration/v1';
export const JUDGE_CALIBRATION_PATH = join(
  FACTORY_RUNS_DIR,
  'judge-calibration.json'
);

export interface JudgeCalibration {
  readonly judge: string;
  readonly passed: boolean;
  /** Null when the judge left items unlabeled, so no kappa exists. */
  readonly kappa: number | null;
  readonly pairedCount: number;
  readonly missing: readonly string[];
  readonly disagreements: readonly string[];
}

export interface JudgeCalibrationReceipt {
  readonly schema: typeof JUDGE_CALIBRATION_SCHEMA;
  readonly labeledAt: string;
  readonly threshold: number;
  readonly calibratedAt: string;
  /** Best agreement first; failed judges last. */
  readonly judges: readonly JudgeCalibration[];
}

/** Holdout `caseId`s are screenshot paths, relative to `baseDir`. */
export async function calibrateVisualJudges(input: {
  readonly holdout: HumanHoldoutSet;
  readonly judges: readonly StageJudge[];
  readonly baseDir: string;
  readonly threshold?: number;
  readonly now?: () => Date;
}): Promise<JudgeCalibrationReceipt> {
  const threshold = input.threshold ?? DEFAULT_KAPPA_THRESHOLD;
  const results: JudgeCalibration[] = [];
  for (const judge of input.judges) {
    if (!judge.id) continue;
    const labels: Record<string, JudgeBinaryLabel> = {};
    for (const item of input.holdout.items) {
      const score = await judge.run({
        row: VISUAL_REVIEW_ROW,
        unit: visualReviewUnit(`calibration-${item.id}`),
        cellId: `factory-judge-calibration::${item.id}`,
        text: null,
        capture: resolve(input.baseDir, item.caseId),
      });
      if (score.verdict !== 'insufficient') labels[item.id] = score.verdict;
    }
    const { paired, missingJudgeLabels } = pairHoldoutLabels(
      input.holdout,
      labels
    );
    const kappa =
      missingJudgeLabels.length === 0 && paired.length > 0
        ? computeHoldoutKappa(paired).kappa
        : null;
    results.push({
      judge: judge.id,
      passed: kappa !== null && Number.isFinite(kappa) && kappa >= threshold,
      kappa: kappa !== null && Number.isFinite(kappa) ? kappa : null,
      pairedCount: paired.length,
      missing: missingJudgeLabels,
      disagreements: paired
        .filter(item => item.humanLabel !== item.judgeLabel)
        .map(item => item.id),
    });
  }
  return {
    schema: JUDGE_CALIBRATION_SCHEMA,
    labeledAt: input.holdout.labeledAt,
    threshold,
    calibratedAt: (input.now ?? (() => new Date()))().toISOString(),
    judges: results.toSorted(
      (a, b) =>
        Number(b.passed) - Number(a.passed) || (b.kappa ?? -1) - (a.kappa ?? -1)
    ),
  };
}

/**
 * Judges the receipt failed, for liveVisualJudges to exclude. Empty when no
 * calibration has run, so an uncalibrated machine keeps today's selection.
 */
export function failedCalibrationJudges(
  path: string = JUDGE_CALIBRATION_PATH
): ReadonlySet<string> {
  if (!existsSync(path)) return new Set();
  const receipt = readJson<JudgeCalibrationReceipt>(path);
  return new Set(receipt.judges.filter(j => !j.passed).map(j => j.judge));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      holdout: { type: 'string' },
      judges: { type: 'string' },
      threshold: { type: 'string' },
    },
  });
  if (!values.holdout || !values.judges) {
    throw new Error(
      'usage: factory:calibrate-judges --holdout <holdout.json> --judges <model,model> [--threshold 0.6]'
    );
  }
  const holdoutPath = resolve(values.holdout);
  const transport = routedTransport(undefined);
  const judges = await Promise.all(
    values.judges.split(',').map(model => liveVisionJudge(transport, model))
  );
  const receipt = await calibrateVisualJudges({
    holdout: loadHumanHoldoutSet(holdoutPath),
    judges,
    baseDir: join(holdoutPath, '..'),
    threshold: values.threshold ? Number(values.threshold) : undefined,
  });
  writeJson(JUDGE_CALIBRATION_PATH, receipt);
  for (const judge of receipt.judges) {
    console.log(
      `${judge.passed ? 'PASS' : 'FAIL'} ${judge.judge} kappa=${judge.kappa?.toFixed(3) ?? 'n/a'} missing=${judge.missing.length} disagreements=${judge.disagreements.length}`
    );
  }
  console.log(`receipt: ${JUDGE_CALIBRATION_PATH}`);
  process.exitCode = receipt.judges.some(j => j.passed) ? 0 : 1;
}

if (process.argv[1] === import.meta.filename) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
