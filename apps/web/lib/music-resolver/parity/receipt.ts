import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { CHARTMETRIC_SCHEMA_SNAPSHOT } from './chartmetric-endpoints';
import {
  PARITY_TARGET_ROW_COUNT,
  PARITY_TARGET_SHA256,
  PARITY_TARGET_VERSION,
  sha256,
} from './target';
import type { ScoreReport } from './types';

const execFileAsync = promisify(execFile);

export async function cleanCandidateSha(repoRoot: string): Promise<string> {
  const git = async (...args: string[]) => {
    const { stdout } = await execFileAsync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return stdout.trim();
  };
  if (await git('status', '--porcelain', '--untracked-files=all')) {
    throw new Error('parity receipts require a clean candidate worktree');
  }
  return git('rev-parse', 'HEAD');
}

export function createEvaluationReceipt(input: {
  readonly candidateSha: string;
  readonly fixtureBytes: Uint8Array;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly report: ScoreReport;
}) {
  const { candidateSha, startedAt, finishedAt, report } = input;
  if (!/^[a-f0-9]{40}$/.test(candidateSha)) {
    throw new Error('parity receipt requires a full candidate SHA');
  }
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('parity receipt requires ordered timestamps');
  }
  return {
    schema: 'jovie.resolver-parity-evaluation/v1',
    scope: 'local-synthetic-contract-probes',
    target: {
      version: PARITY_TARGET_VERSION,
      denominator: PARITY_TARGET_ROW_COUNT,
      sha256: PARITY_TARGET_SHA256,
      inventoryComplete: false,
    },
    sources: { chartmetric: CHARTMETRIC_SCHEMA_SNAPSHOT },
    candidateSha,
    deployment: null,
    startedAt,
    finishedAt,
    node: process.versions.node,
    corpus: {
      sha256: sha256(input.fixtureBytes),
      expectedSource: 'apps/web/lib/music-resolver/parity/probes.ts',
      independentlyAdjudicated: false,
      kind: 'synthetic-regression-fixtures',
    },
    certification: 'not-evaluated',
    acquisitionBlockers: ['JOV-8468', 'JOV-8469'],
    certificationOwner: 'JOV-7833',
    report,
  } as const;
}

/** Content-addressed, exclusive creation: an existing receipt is never replaced. */
export async function writeEvaluationReceipt(
  directory: string,
  receipt: ReturnType<typeof createEvaluationReceipt>
): Promise<string> {
  const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${sha256(bytes)}.json`);
  await writeFile(file, bytes, { flag: 'wx', mode: 0o444 });
  return file;
}
