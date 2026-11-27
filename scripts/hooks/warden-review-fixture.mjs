import { spawnSync } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { localHookChildEnv } from './local-hook-child-env.mjs';

// npm-lane fixtures must never resolve a developer's real Warden installation.
export function reviewFixtureEnv(extra, bin) {
  const env = localHookChildEnv(extra, bin);
  if (!existsSync(join(bin, 'npm'))) return env;
  for (const tool of ['bash', 'git', 'cat', 'mkdir', 'test', 'dirname']) {
    if (existsSync(join(bin, tool))) continue;
    const result = spawnSync('bash', ['-c', `type -P ${tool}`], {
      encoding: 'utf8',
    });
    if (result.status !== 0 || !result.stdout.trim())
      throw new Error(`missing fixture tool ${tool}`);
    symlinkSync(result.stdout.trim(), join(bin, tool));
  }
  if (!existsSync(join(bin, 'node')))
    symlinkSync(process.execPath, join(bin, 'node'));
  return { ...env, PATH: bin };
}

// Synthetic finalized JSONL matching the supported Warden chunk-v1 contract.
export function structuredResult({
  failed = false,
  findings = [],
  model = 'requested-model',
} = {}) {
  const run = {
    runId: 'fixture-run',
    timestamp: '2026-11-27T00:00:00Z',
    durationMs: 12,
    cwd: '/fixture',
  };
  const usage = { inputTokens: 10, outputTokens: 2, costUSD: 0.002 };
  const chunks = ['security-review', 'code-review'].map(skill => ({
    schemaVersion: 1,
    run,
    skill,
    model,
    chunk: { file: 'app.ts', index: 1, total: 1, lineRange: '1-3' },
    status: failed ? 'error' : 'ok',
    findings: skill === 'code-review' ? findings : [],
    durationMs: 6,
    usageBreakdown: { scan: { model, usage }, total: { usage } },
  }));
  return (
    [
      ...chunks,
      {
        run,
        type: 'summary',
        totalFindings: findings.length,
        bySeverity: { high: findings.length, medium: 0, low: 0 },
        totalFailedHunks: failed ? 1 : undefined,
        usageBreakdown: {
          scan: { usage: { inputTokens: 20, outputTokens: 4, costUSD: 0.004 } },
          total: {
            usage: { inputTokens: 20, outputTokens: 4, costUSD: 0.004 },
          },
        },
      },
    ]
      .map(row => JSON.stringify(row))
      .join('\n') + '\n'
  );
}
