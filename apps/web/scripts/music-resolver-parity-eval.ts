import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runParityEvaluation } from '../lib/music-resolver/parity/evaluate';
import {
  cleanCandidateSha,
  createEvaluationReceipt,
  writeEvaluationReceipt,
} from '../lib/music-resolver/parity/receipt';
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
  const args = process.argv.slice(2);
  if (
    args.length &&
    (args.length !== 2 || args[0] !== '--receipt-dir' || !args[1])
  ) {
    throw new Error('usage: parity:music-resolver [--receipt-dir DIRECTORY]');
  }
  const candidateSha = cleanCandidateSha(repoRoot);
  const startedAt = new Date().toISOString();
  const fixtureBytes = readFileSync(
    resolve(repoRoot, 'apps/web/lib/music-resolver/parity/probes.ts')
  );
  const report = await runParityEvaluation();
  if (cleanCandidateSha(repoRoot) !== candidateSha) {
    throw new Error('candidate changed during parity evaluation');
  }
  const receipt = createEvaluationReceipt({
    candidateSha,
    fixtureBytes,
    startedAt,
    finishedAt: new Date().toISOString(),
    report,
  });
  const receiptFile = args[1]
    ? writeEvaluationReceipt(resolve(args[1]), receipt)
    : null;
  const summary = {
    receipt,
    receiptFile,
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
