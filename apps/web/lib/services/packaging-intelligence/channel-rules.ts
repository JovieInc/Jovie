/**
 * Per-channel / per-topic packaging rules learning layer (JovieInc/Jovie#10920).
 *
 * Stores observed packaging lift data from A/B experiments and overrides
 * global niche priors (1of10 dataset) once confidence crosses a threshold.
 *
 * Design principles (from parent issue + gbrain patterns):
 * - Raw/synthesized split: experiment outcomes are raw; resolved priors are synthesised.
 * - Confidence + supersede: observed data wins once MIN_SAMPLE_SIZE + CONFIDENCE_THRESHOLD met.
 * - Provenance edges: every dimension rule carries an immutable provenance log.
 * - Pure functions only — persistence is the caller's concern (no DB coupling here).
 */

import type {
  FaceEffect,
  NichePriors,
  TextEffect,
  TitleLengthBias,
} from './types';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Minimum experiment sample size before observed data overrides global priors. */
export const MIN_SAMPLE_SIZE = 100;

/**
 * Statistical confidence required to override a global prior.
 * Below this threshold the global 1of10 prior is still returned.
 */
export const CONFIDENCE_THRESHOLD = 0.8;

// -----------------------------------------------------------------------------
// Packaging dimensions
// -----------------------------------------------------------------------------

/** Packaging dimensions that can be independently A/B tested. */
export type PackagingDimension = 'face' | 'text' | 'titleLength';

// -----------------------------------------------------------------------------
// Provenance
// -----------------------------------------------------------------------------

export interface ProvenanceEntry {
  readonly experimentId: string;
  readonly outcome: 'win' | 'loss' | 'inconclusive';
  readonly recordedAt: string;
}

// -----------------------------------------------------------------------------
// Dimension rules
// -----------------------------------------------------------------------------

export interface DimensionRule {
  /** Net lift direction after aggregating all experiments. */
  readonly liftDirection: 'positive' | 'negative' | 'neutral';
  /** Weighted-average lift in percentage points (positive = variant B wins). */
  readonly liftPercent: number;
  /** Aggregated statistical confidence (0–1). */
  readonly confidence: number;
  /** Total impression-weighted sample size across all contributing experiments. */
  readonly sampleSize: number;
  /** Immutable provenance log — one entry per experiment, append-only. */
  readonly provenance: readonly ProvenanceEntry[];
  readonly updatedAt: string;
}

// -----------------------------------------------------------------------------
// Channel packaging rules
// -----------------------------------------------------------------------------

export interface ChannelPackagingRules {
  readonly channelId: string;
  /** null = rules apply to all topics on this channel */
  readonly topic: string | null;
  readonly dimensions: Partial<Record<PackagingDimension, DimensionRule>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// -----------------------------------------------------------------------------
// Experiment outcome (input from experiment engine)
// -----------------------------------------------------------------------------

export interface PackagingVariantSpec {
  readonly hasFace?: boolean;
  readonly hasText?: boolean;
  /** Word count bucket for title length experiments */
  readonly titleWordCount?: number;
}

export interface ExperimentOutcome {
  readonly experimentId: string;
  readonly channelId: string;
  /** null = outcome applies to all topics on this channel */
  readonly topic: string | null;
  readonly dimension: PackagingDimension;
  readonly variantA: PackagingVariantSpec; // control
  readonly variantB: PackagingVariantSpec; // treatment
  /** 'A' = control wins; 'B' = treatment wins */
  readonly winner: 'A' | 'B' | 'inconclusive';
  /** Lift in percentage points from B vs A (positive = B wins). */
  readonly liftPercent: number;
  readonly sampleSize: number;
  /** Statistical confidence of the experiment result (0–1). */
  readonly confidence: number;
  readonly recordedAt: string;
}

// -----------------------------------------------------------------------------
// Learning: apply a new experiment outcome to existing channel rules
// -----------------------------------------------------------------------------

/**
 * Applies a single experiment outcome to the existing channel rules.
 *
 * Uses a sample-size-weighted average so larger experiments carry more weight.
 * The provenance log grows append-only.
 *
 * Callers are responsible for persisting the returned value.
 */
export function applyExperimentOutcome(
  existing: ChannelPackagingRules | null,
  outcome: ExperimentOutcome
): ChannelPackagingRules {
  const now = outcome.recordedAt;
  const prev = existing?.dimensions[outcome.dimension];

  const prevSample = prev?.sampleSize ?? 0;
  const totalSample = prevSample + outcome.sampleSize;

  // Weighted-average lift
  const prevLift = prev?.liftPercent ?? 0;
  const newLift =
    totalSample > 0
      ? (prevLift * prevSample + outcome.liftPercent * outcome.sampleSize) /
        totalSample
      : outcome.liftPercent;

  // Weighted-average confidence
  const prevConf = prev?.confidence ?? 0;
  const newConf =
    totalSample > 0
      ? (prevConf * prevSample + outcome.confidence * outcome.sampleSize) /
        totalSample
      : outcome.confidence;

  const provenanceEntry: ProvenanceEntry = {
    experimentId: outcome.experimentId,
    outcome:
      outcome.winner === 'B'
        ? 'win'
        : outcome.winner === 'A'
          ? 'loss'
          : 'inconclusive',
    recordedAt: now,
  };

  const updatedDimension: DimensionRule = {
    liftDirection:
      newLift > 0 ? 'positive' : newLift < 0 ? 'negative' : 'neutral',
    liftPercent: newLift,
    confidence: newConf,
    sampleSize: totalSample,
    provenance: [...(prev?.provenance ?? []), provenanceEntry],
    updatedAt: now,
  };

  const baseDimensions = existing?.dimensions ?? {};
  return {
    channelId: outcome.channelId,
    topic: outcome.topic,
    dimensions: { ...baseDimensions, [outcome.dimension]: updatedDimension },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

// -----------------------------------------------------------------------------
// Retrieval: resolve final priors for a channel (channel overrides global)
// -----------------------------------------------------------------------------

function dimensionOverridesGlobalPrior(rule: DimensionRule): boolean {
  return (
    rule.sampleSize >= MIN_SAMPLE_SIZE &&
    rule.confidence >= CONFIDENCE_THRESHOLD
  );
}

function liftDirectionToFaceEffect(rule: DimensionRule): FaceEffect {
  return rule.liftDirection === 'positive'
    ? 'helps'
    : rule.liftDirection === 'negative'
      ? 'hurts'
      : 'neutral';
}

function liftDirectionToTextEffect(rule: DimensionRule): TextEffect {
  return rule.liftDirection === 'positive'
    ? 'helps'
    : rule.liftDirection === 'negative'
      ? 'hurts'
      : 'neutral';
}

function liftDirectionToTitleLengthBias(rule: DimensionRule): TitleLengthBias {
  // positive lift on titleLength dimension means the tested variant (B) had more words
  // we expose this as the bias signal; callers interpret accordingly
  return rule.liftDirection === 'positive'
    ? 'long'
    : rule.liftDirection === 'negative'
      ? 'short'
      : 'medium';
}

/**
 * Merges per-channel observed rules with global niche priors.
 *
 * Channel rules override global priors only when:
 *   - sampleSize >= MIN_SAMPLE_SIZE, AND
 *   - confidence >= CONFIDENCE_THRESHOLD
 *
 * When both conditions are met, source is set to 'observed' so downstream
 * consumers (generator, channel-intel report) know the prior is evidence-backed.
 */
export function resolvePackagingPriors(
  channelRules: ChannelPackagingRules | null,
  globalPriors: NichePriors
): NichePriors {
  if (!channelRules) return globalPriors;

  let { faceEffect, textEffect, titleLengthBias } = globalPriors;
  let anyOverride = false;

  const faceRule = channelRules.dimensions.face;
  if (faceRule && dimensionOverridesGlobalPrior(faceRule)) {
    faceEffect = liftDirectionToFaceEffect(faceRule);
    anyOverride = true;
  }

  const textRule = channelRules.dimensions.text;
  if (textRule && dimensionOverridesGlobalPrior(textRule)) {
    textEffect = liftDirectionToTextEffect(textRule);
    anyOverride = true;
  }

  const titleRule = channelRules.dimensions.titleLength;
  if (titleRule && dimensionOverridesGlobalPrior(titleRule)) {
    titleLengthBias = liftDirectionToTitleLengthBias(titleRule);
    anyOverride = true;
  }

  return {
    faceEffect,
    textEffect,
    titleLengthBias,
    source: anyOverride ? 'observed' : globalPriors.source,
  };
}
