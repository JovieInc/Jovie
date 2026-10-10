import {
  buildCatalog,
  materializeCatalog,
  REQUIRED_LOCAL_PASS_IDS,
} from './catalog';
import { runParityProbes } from './probes';
import { rowIsPass, scoreRows } from './score';
import type { CatalogEntry, ProbeResult, ScoreReport } from './types';

export function finishEvaluation(
  rows: Parameters<typeof scoreRows>[0]
): ScoreReport {
  const scored = scoreRows(rows);
  if (scored.exitCode !== 0) return scored;
  const passingIds = scored.rows
    .filter(row => rowIsPass(row))
    .map(row => row.id)
    .sort();
  const required = [...REQUIRED_LOCAL_PASS_IDS].sort();
  if (passingIds.join('\n') !== required.join('\n')) {
    return { ...scored, exitCode: 1 };
  }
  return scored;
}

export async function evaluateCatalog(
  entries: readonly CatalogEntry[],
  probes: readonly ProbeResult[]
): Promise<ScoreReport> {
  return finishEvaluation(materializeCatalog(entries, probes));
}

export async function runParityEvaluation(): Promise<ScoreReport> {
  const probes = await runParityProbes();
  return evaluateCatalog(buildCatalog(), probes);
}
