/** Pure logic for imagery:verify: geometry, verdicts, staleness. No IO. */
import { createHash } from 'node:crypto';
import {
  type ImageryStageSpec,
  insideStage,
  rectsOverlap,
  type StageRect,
} from '../../lib/imagery/stages';
import type { ImageryManifest, StageVerdict } from './manifest';
import { hashPlateSpec, hashStageSpec } from './spec-hash.mjs';

export type VerifyViewport = 'desktop' | 'mobile';
export const VERIFY_VIEWPORTS: Record<
  VerifyViewport,
  { width: number; height: number }
> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

export interface JudgeFinding {
  readonly source: string;
  readonly severity: 'blocker' | 'major' | 'minor';
  readonly detail: string;
  /**
   * False records the finding without failing the stage: waived Clef rules,
   * and uncalibrated vision judges below `blocker` (vision.config.json keeps
   * those judges in shadow until precision/recall floors are met).
   */
  readonly gate?: boolean;
}

export function imageHash(png: Uint8Array): string {
  return createHash('sha256').update(png).digest('hex');
}

/**
 * Geometry of the rendered DOM against the spec. `layers` are bounding boxes
 * as fractions of the stage, read from the live page, so a CSS change that
 * moves a layer into the quiet zone fails here and not only in the spec test.
 */
export function geometryFindings(
  stage: ImageryStageSpec,
  viewport: VerifyViewport,
  layers: readonly { shotId: string; box: StageRect; visible: boolean }[]
): JudgeFinding[] {
  const findings: JudgeFinding[] = [];
  const expected = stage.layers.filter(
    layer => !(viewport === 'mobile' && layer.mobile === 'hidden')
  );
  const seen = new Set(layers.filter(l => l.visible).map(l => l.shotId));
  for (const layer of expected) {
    if (!seen.has(layer.shotId)) {
      findings.push({
        source: 'geometry',
        severity: 'blocker',
        detail: `layer ${layer.shotId} did not render at ${viewport}`,
      });
    }
  }
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (!insideStage(layer.box, 0)) {
      findings.push({
        source: 'geometry',
        severity: 'major',
        detail: `layer ${layer.shotId} leaves the stage at ${viewport}`,
      });
    }
    if (viewport === 'desktop' && rectsOverlap(layer.box, stage.safeArea)) {
      findings.push({
        source: 'geometry',
        severity: 'blocker',
        detail: `layer ${layer.shotId} enters the quiet zone`,
      });
    }
  }
  return findings;
}

/** A stage verdict passes when no blocker and fewer than two majors remain. */
export function buildVerdict(
  findings: readonly JudgeFinding[],
  meta: { judge: string; model: string; at: string; imageHash: string }
): StageVerdict {
  const gating = findings.filter(f => f.gate !== false);
  const blockers = gating.filter(f => f.severity === 'blocker').length;
  const majors = gating.filter(f => f.severity === 'major').length;
  return {
    pass: blockers === 0 && majors < 2,
    findings: findings.map(
      f =>
        `${f.source} ${f.gate === false ? 'advisory' : f.severity}: ${f.detail}`
    ),
    ...meta,
  };
}

export interface VerifyArgs {
  readonly only: string | null;
  readonly stale: boolean;
  readonly baseUrl: string;
  readonly judge: boolean;
}

export function parseVerifyArgs(
  argv: readonly string[],
  env: Record<string, string | undefined> = {}
): VerifyArgs {
  let only: string | null = null;
  let stale = false;
  let judge = true;
  let baseUrl = env.IMAGERY_BASE_URL ?? 'http://localhost:3000';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--only') only = argv[(i += 1)] ?? null;
    else if (arg === '--stale') stale = true;
    else if (arg === '--base-url') baseUrl = argv[(i += 1)] ?? baseUrl;
    else if (arg === '--no-judge') judge = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { only, stale, baseUrl: baseUrl.replace(/\/$/, ''), judge };
}

/** A stage needs (re)verification when its spec, plate or verdicts are not current. */
export function needsVerify(
  stage: ImageryStageSpec,
  manifest: ImageryManifest,
  shotManifest: Record<string, { sourceHash: string } | undefined>
): boolean {
  const entry = manifest.stages[stage.id];
  const plate = manifest.plates[stage.plate.id];
  if (!entry || !plate) return true;
  if (entry.specHash !== hashStageSpec(stage, shotManifest)) return true;
  if (plate.specHash !== hashPlateSpec(stage)) return true;
  return !(entry.verdicts?.desktop && entry.verdicts?.mobile);
}
