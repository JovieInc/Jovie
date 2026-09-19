/**
 * Jev (typesafe-ai/jev) decision layer for PR Conflict FX.
 *
 * The conflict handler used to assume a generative FX model end-to-end. Per
 * the 2026-09-17 spend directive, decisioning is split from generation:
 * Jev — a System One evaluation model on the Vercel AI Gateway — classifies
 * the exact typed conflict set and decides whether a generative GLM pass is
 * actually required. `zai/glm-5.3` only emits conflict-resolution patch text
 * when Jev approves the generative strategy at acceptable risk.
 *
 * This module is pure and dependency-free: the workflow step imports 'ai'
 * itself and injects the evaluate implementation, so tests run without the
 * AI SDK and the module can be executed from a trusted-main checkout via the
 * same `git show <main>:<path>` pattern as scripts/run-affected-tests.mjs.
 */

export const CONFLICT_FX_JEV_DECISION_SCHEMA =
  'jovie-conflict-fx-jev-decision/v1';

/** Gateway evaluation model used for conflict decisioning. */
export const CONFLICT_FX_DECISION_MODEL = 'typesafe-ai/jev';

/** Jev must select the generative strategy for the FX step to run. */
export const JEV_GENERATIVE_STRATEGY = 'generative-fx';

/** Risk at or above this score (1-indexed rubric position) defers the FX pass. */
export const JEV_MAX_PROCEED_RISK = 2;

/** Minimum probability that a generative attempt is safe to auto-apply. */
export const JEV_MIN_SAFE_TO_ATTEMPT_PROBABILITY = 0.75;

/**
 * Build the shared Jev evaluation state for one exact conflict pair.
 *
 * Contains only planner-derived metadata (paths, blob oids, attempt bounds) —
 * never file contents, secrets, or credential-bearing material.
 */
export function buildJevDecisionState({
  prNumber,
  attempt,
  maxAttempts = 2,
  conflictFiles = [],
  competingChanges = [],
}) {
  return {
    prNumber,
    attempt,
    maxAttempts,
    conflictFiles,
    competingChanges,
  };
}

/**
 * Typed questions asked of Jev in a single round trip:
 * - strategy: which resolution approach fits this conflict set
 * - safeToAttempt: probability a bounded generative pass is safe to auto-apply
 * - risk: ordered rubric of merge-damage risk if the resolution is wrong
 */
export function buildJevQuestions() {
  return {
    strategy: {
      type: 'choice',
      instructions:
        'A pull request conflicts with its base. Given the conflicting file set and the competing blob evidence, which resolution strategy fits?',
      criteria: {
        'generative-fx':
          'Both sides contain independent changes that need a semantic merge; a model should produce the resolution patch text.',
        'mechanical-theirs':
          'The base side should simply win for these paths; no model judgment is required.',
        'mechanical-ours':
          'The pull-request side should simply win for these paths; no model judgment is required.',
        defer:
          'The conflict is too entangled or subjective for a bounded automated resolution; route to the steering-exception path.',
      },
    },
    safeToAttempt: {
      type: 'boolean',
      instructions:
        'Is it safe to attempt a bounded automated generative resolution of these conflicts in an isolated checkout that is independently verified before anything is pushed?',
      criteria: {
        true: 'The conflicting paths are ordinary source files; a wrong candidate is caught by independent verification and never merges automatically.',
        false:
          'A wrong resolution could plausibly pass verification and merge, or the conflict involves policy-protected paths.',
      },
    },
    risk: {
      type: 'score',
      instructions:
        'If an automated resolution of these conflicts silently picked the wrong side, how damaging would that be once merged?',
      criteria: [
        'low: conflicting paths are peripheral; a wrong pick is trivially reverted',
        'medium: conflicting paths affect feature behavior; a wrong pick is noticeable but recoverable',
        'high: conflicting paths touch auth, payments, migrations, or CI policy; a wrong pick is dangerous',
      ],
    },
  };
}

/**
 * Interpret Jev's typed answers into a gate decision.
 *
 * Fails closed: a missing, malformed, or low-confidence answer defers the
 * generative pass rather than approving it.
 */
export function interpretJevDecision(answers) {
  const strategy = answers?.strategy;
  const safeToAttempt = answers?.safeToAttempt;
  const risk = answers?.risk;

  const strategyChoice =
    typeof strategy?.choice === 'string' ? strategy.choice : null;
  const safeProbability =
    typeof safeToAttempt?.probability === 'number' &&
    Number.isFinite(safeToAttempt.probability)
      ? safeToAttempt.probability
      : 0;
  const riskScore =
    typeof risk?.score === 'number' && Number.isFinite(risk.score)
      ? risk.score
      : Number.POSITIVE_INFINITY;

  const reasons = [];
  if (strategyChoice === null) {
    reasons.push('missing or malformed strategy answer');
  } else if (strategyChoice !== JEV_GENERATIVE_STRATEGY) {
    reasons.push(`strategy=${strategyChoice}`);
  }
  if (riskScore > JEV_MAX_PROCEED_RISK) {
    reasons.push(`risk=${Number.isFinite(riskScore) ? riskScore : 'unknown'}`);
  }
  if (safeProbability < JEV_MIN_SAFE_TO_ATTEMPT_PROBABILITY) {
    reasons.push(`safeToAttempt=${safeProbability}`);
  }

  return {
    proceed: reasons.length === 0,
    strategy: strategyChoice,
    risk: Number.isFinite(riskScore) ? riskScore : null,
    safeToAttemptProbability: safeProbability,
    reason: reasons.join('; '),
  };
}

/**
 * Run the Jev evaluation with an injected evaluate implementation
 * (the AI SDK's experimental_evaluate bound to gateway.evaluationModel).
 * Returns the raw answers plus the interpreted gate decision.
 */
export async function runJevDecision({ state, evaluate }) {
  const result = await evaluate({
    model: CONFLICT_FX_DECISION_MODEL,
    state,
    questions: buildJevQuestions(),
  });
  const answers = result?.answers ?? {};
  return {
    schema: CONFLICT_FX_JEV_DECISION_SCHEMA,
    model: CONFLICT_FX_DECISION_MODEL,
    state,
    answers,
    ...interpretJevDecision(answers),
  };
}
