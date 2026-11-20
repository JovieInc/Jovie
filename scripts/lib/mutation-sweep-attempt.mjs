// Compose measured attempts with the existing state identity and independent ratchet.
import { scoreMutants } from './mutation-diff.mjs';
import { finalizeEvidenceEntry } from './mutation-evidence.mjs';
import {
  extractSurvivors,
  partitionEquivalents,
  recordRun,
} from './mutation-sweep.mjs';

/** Partial counts are diagnostics only, and malformed status rows are not countable. */
function reportSummary(mutants) {
  if (
    !Array.isArray(mutants) ||
    mutants.some(
      row =>
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        typeof row.status !== 'string'
    )
  )
    throw new Error('mutants must be an array of status objects');
  return { total: mutants.length, counts: scoreMutants(mutants).counts };
}

function validateSurvivorSpans(mutants, source) {
  const lines = typeof source === 'string' ? source.split('\n') : [];
  for (const mutant of mutants) {
    if (!['Survived', 'NoCoverage'].includes(mutant.status)) continue;
    const { start, end } = mutant.location ?? {};
    const inside = position =>
      Number.isSafeInteger(position?.line) &&
      position.line > 0 &&
      position.line <= lines.length &&
      Number.isSafeInteger(position.column) &&
      position.column > 0 &&
      position.column <= lines[position.line - 1].length + 1;
    if (
      !inside(start) ||
      !inside(end) ||
      end.line < start.line ||
      (end.line === start.line && end.column < start.column) ||
      typeof mutant.mutatorName !== 'string' ||
      !mutant.mutatorName
    )
      throw new Error('survivor span or mutator is invalid');
  }
}

/** Complete evidence alone can produce a scored entry or an actionable task. */
export function recordEvidenceAttempt({
  state,
  file,
  blob,
  sha,
  at,
  durationMs,
  mutants,
  partialMutants,
  source,
  tests,
  baseline,
  equivalents,
  configDigest,
  runId,
  timedOut,
  unchanged,
  error,
  receipt,
  previous,
}) {
  /** @type {import('./mutation-evidence.mjs').EvidenceEntry} */
  let entry;
  let real = [];
  let diagnostic;
  try {
    if (!mutants?.length || !unchanged) {
      entry = recordRun(state, file, {
        blob,
        sha,
        at,
        durationMs,
        error:
          error ??
          (!unchanged
            ? 'Mutation inputs changed during scoring'
            : 'No complete mutation report'),
      });
      if (partialMutants) entry.partial = reportSummary(partialMutants);
    } else {
      diagnostic = reportSummary(mutants);
      validateSurvivorSpans(mutants, source);
      const partitioned = partitionEquivalents(
        extractSurvivors(file, source, mutants),
        equivalents
      );
      real = partitioned.real;
      entry = recordRun(state, file, {
        blob,
        sha,
        at,
        durationMs,
        mutants,
        equivalent: partitioned.equivalent.length,
      });
      const scored = scoreMutants(mutants);
      Object.assign(entry, {
        unknown: scored.unknown,
        complete: scored.complete,
        counts: scored.counts,
      });
      if (!scored.complete) entry.status = 'error';
      if (
        scored.complete &&
        partitioned.equivalent.length > 0 &&
        entry.valid > 0
      ) {
        entry.valid -= partitioned.equivalent.length;
        entry.survived = Math.max(
          0,
          entry.survived - partitioned.equivalent.length
        );
        entry.score =
          entry.valid > 0
            ? Math.round((entry.killed / entry.valid) * 1000) / 10
            : null;
      }
    }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    entry = recordRun(state, file, {
      blob,
      sha,
      at,
      durationMs,
      error: `${error ? `${error}; ` : ''}Invalid mutation report: ${reason}`,
    });
    const raw = mutants ?? partialMutants;
    entry.partial = diagnostic ?? {
      total: Array.isArray(raw) ? raw.length : null,
      error: reason,
    };
  }
  const finalized = finalizeEvidenceEntry({
    file,
    entry,
    previous,
    baseline,
    configDigest,
    runId,
    timedOut,
  });
  entry = finalized.entry;
  Object.assign(entry.evidence, receipt);
  // A complete small sample is a measurement, while its ratchet stays unknown.
  if (
    finalized.verdict.status === 'unknown' &&
    finalized.verdict.reason !== 'insufficient mutation sample'
  ) {
    entry.measuredScore = entry.score;
    entry.score = null;
    if (entry.status === 'scored') entry.status = 'unknown';
  }
  const task =
    entry.status === 'scored' && entry.score !== null
      ? {
          file,
          sha,
          score: entry.score,
          valid: entry.valid,
          tests,
          survivors: real,
          evidence: entry.evidence,
        }
      : null;
  return { ...finalized, entry, task };
}

/** Unsupported input resolution spends no mutant budget and remains unknown. */
export function unresolvedMutationRun(inputs) {
  return {
    status: null,
    error: new Error(`Unresolved mutation inputs: ${inputs.join(', ')}`),
    cleanupProved: true,
    timedOut: false,
    interrupted: false,
    unsupported: true,
    tempDir: undefined,
  };
}
