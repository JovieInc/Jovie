import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

import {
  cleanCandidateSha,
  createEvaluationReceipt,
  writeEvaluationReceipt,
} from './receipt';
import { sha256 } from './target';
import type { ScoreReport } from './types';

const report: ScoreReport = {
  denominator: 1,
  passing: 0,
  unblockedFailures: [],
  blocked: [],
  exitCode: 1,
  rows: [
    {
      id: 'blocked-fixture',
      vendor: 'jovie',
      capability: 'Unacquired expectation',
      docUrl: 'https://example.com',
      status: 'access-blocked',
    },
  ],
};
const input = {
  candidateSha: 'a'.repeat(40),
  fixtureBytes: new TextEncoder().encode('independent-of-run fixture bytes'),
  startedAt: '2026-10-15T15:00:00.000Z',
  finishedAt: '2026-10-15T15:00:01.000Z',
  report,
};
const directories: string[] = [];

afterEach(() => {
  vi.resetAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('parity receipt', () => {
  it('binds expectations, candidate, timestamps and every failed row without certification', () => {
    const receipt = createEvaluationReceipt(input);
    expect(receipt).toMatchObject({
      schema: 'jovie.resolver-parity-evaluation/v1',
      candidateSha: input.candidateSha,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      target: { inventoryComplete: false },
      corpus: {
        sha256: sha256(input.fixtureBytes),
        expectedSource: 'apps/web/lib/music-resolver/parity/probes.ts',
        independentlyAdjudicated: false,
      },
      deployment: null,
      certification: 'not-evaluated',
      report,
    });
    const changed = createEvaluationReceipt({
      ...input,
      fixtureBytes: new TextEncoder().encode('changed expectation'),
    });
    expect(changed.corpus.sha256).not.toBe(receipt.corpus.sha256);
  });

  it('writes content-addressed receipts exclusively and preserves existing bytes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jov-7822-receipt-'));
    directories.push(directory);
    const receipt = createEvaluationReceipt(input);
    const file = writeEvaluationReceipt(join(directory, 'receipts'), receipt);
    const bytes = readFileSync(file);
    expect(basename(file)).toBe(`${sha256(bytes)}.json`);
    expect(statSync(file).mode & 0o777).toBe(0o444);
    expect(JSON.parse(bytes.toString())).toEqual(receipt);
    expect(() =>
      writeEvaluationReceipt(join(directory, 'receipts'), receipt)
    ).toThrow();
    expect(readFileSync(file)).toEqual(bytes);
  });

  it.each([
    { candidateSha: 'short' },
    { startedAt: 'invalid' },
    { finishedAt: 'invalid' },
    { finishedAt: '2026-10-15T14:59:59.000Z' },
  ])('rejects unverifiable identity or timestamps: %j', override => {
    expect(() => createEvaluationReceipt({ ...input, ...override })).toThrow();
  });

  it('rejects dirty candidates and reads the actual clean HEAD', () => {
    vi.mocked(execFileSync).mockReturnValueOnce(' M probes.ts');
    expect(() => cleanCandidateSha('/repo')).toThrow('clean candidate');
    vi.mocked(execFileSync)
      .mockReturnValueOnce('')
      .mockReturnValueOnce(input.candidateSha);
    expect(cleanCandidateSha('/repo')).toBe(input.candidateSha);
    expect(execFileSync).toHaveBeenLastCalledWith(
      'git',
      ['rev-parse', 'HEAD'],
      {
        cwd: '/repo',
        encoding: 'utf8',
      }
    );
  });
});
