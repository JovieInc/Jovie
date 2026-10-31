/**
 * Read ProfileFactObservation JSON lines (from coverage.sql) on stdin and
 * print the verify-everything coverage report as JSON.
 *
 *   psql "$DATABASE_URL" -X -At -f scripts/verify-everything/coverage.sql \
 *     | pnpm --filter web exec tsx scripts/verify-everything/coverage.ts
 */
import { createInterface } from 'node:readline';
import {
  buildCoverageReport,
  type ProfileFactObservation,
} from '../../lib/verify-everything/fact-contract';

export function parseObservationLines(
  lines: readonly string[]
): ProfileFactObservation[] {
  const observations: ProfileFactObservation[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    const parsed = JSON.parse(trimmed) as ProfileFactObservation;
    if (typeof parsed.profileId === 'string') observations.push(parsed);
  }
  return observations;
}

async function main(): Promise<void> {
  const lines: string[] = [];
  for await (const line of createInterface({ input: process.stdin })) {
    lines.push(line);
  }
  const report = buildCoverageReport(parseObservationLines(lines));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('coverage.ts')) {
  main().catch(error => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  });
}
