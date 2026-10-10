import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runParityEvaluation } from '../lib/music-resolver/parity/evaluate';
import { nodeMatchesNvmrc } from '../lib/music-resolver/parity/runtime';
import { rowIsPass } from '../lib/music-resolver/parity/score';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function assertNode(): void {
  const required = readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8');
  if (nodeMatchesNvmrc(process.versions.node, required)) return;
  process.stderr.write(
    `parity eval requires Node ${required.trim()} from .nvmrc; running ${process.versions.node}\n`
  );
  process.exit(1);
}

async function main(): Promise<void> {
  assertNode();
  const report = await runParityEvaluation();
  const summary = {
    node: process.versions.node,
    denominator: report.denominator,
    passing: report.passing,
    passingIds: report.rows
      .filter(row => rowIsPass(row))
      .map(row => row.id)
      .sort(),
    unblockedFailureIds: report.unblockedFailures.map(row => row.id).sort(),
    blockedIds: report.blocked.map(row => row.id).sort(),
    exitCode: report.exitCode,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(report.exitCode);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'parity eval failed';
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
