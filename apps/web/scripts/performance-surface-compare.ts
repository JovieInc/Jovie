#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  compareSurfaceMeasurements,
  loadTrustedSurfaceBaseline,
  type SurfaceAttempt,
  type SurfaceBaselineTrust,
} from './performance-surface-comparator';

/** The host owns trustFile and expectedHead; candidateFile supplies only runs. */
export function runSurfaceComparison(
  repoRoot: string,
  trustFile: string,
  candidateFile: string,
  expectedHead: string,
  now = Date.now()
) {
  try {
    const trust = JSON.parse(
      readFileSync(trustFile, 'utf8')
    ) as SurfaceBaselineTrust;
    const baseline = loadTrustedSurfaceBaseline(repoRoot, trust, now);
    const candidate = JSON.parse(readFileSync(candidateFile, 'utf8')) as {
      runs: readonly SurfaceAttempt[];
    };
    return {
      ...compareSurfaceMeasurements(
        baseline,
        candidate.runs,
        expectedHead,
        now
      ),
      provenance: baseline.provenance,
    };
  } catch (error) {
    return {
      status: 'fail' as const,
      reasons: [error instanceof Error ? error.message : 'invalid evidence'],
    };
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [, , trustFile, candidateFile, expectedHead] = process.argv;
  if (
    process.argv.length !== 5 ||
    !trustFile ||
    !candidateFile ||
    !expectedHead
  ) {
    console.error(
      'Usage: pnpm exec tsx apps/web/scripts/performance-surface-compare.ts <host-trust.json> <candidate.json> <exact-candidate-sha>'
    );
    process.exitCode = 1;
  } else {
    const result = runSurfaceComparison(
      process.cwd(),
      trustFile,
      candidateFile,
      expectedHead
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'pass' ? 0 : 1;
  }
}
