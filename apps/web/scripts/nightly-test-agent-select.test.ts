// @vitest-environment node
/**
 * Regression: select must consume skill-delta before ranking.
 * Silent rediscovery (ignoring a present delta) fails this suite.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const script = path.join(repoRoot, 'apps/web/scripts/nightly-test-agent.ts');
const preferredTargetId = 'validation-schemas';

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runSelect(outDir: string, extraArgs: string[] = []) {
  execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      script,
      'select',
      '--repo',
      'jovie',
      '--out',
      outDir,
      '--limit',
      '1',
      ...extraArgs,
    ],
    {
      // Match reliability-entropy CLI harness: path aliases resolve from apps/web.
      cwd: path.join(repoRoot, 'apps/web'),
      timeout: 20_000,
      stdio: 'pipe',
      env: {
        ...process.env,
        UPSTASH_REDIS_REST_URL: '',
        UPSTASH_REDIS_TOKEN: '',
        UPSTASH_REDIS_REST_TOKEN: '',
      },
    }
  );
  return JSON.parse(
    readFileSync(path.join(outDir, 'selected-targets.json'), 'utf8')
  ) as {
    skillDeltaConsumed: boolean;
    skillDeltaPath: string | null;
    selectedTargets: Array<{
      id: string;
      score: number;
      scoreBreakdown: Record<string, number>;
      reasons: string[];
    }>;
  };
}

describe('nightly select skill-delta consume-before-select', () => {
  it('loads and prefers a prior skill-delta target before ranking', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nightly-skill-delta-'));
    temporaryDirs.push(root);
    const withoutDelta = path.join(root, 'without');
    const withDelta = path.join(root, 'with');
    const deltaPath = path.join(root, 'skill-delta.json');
    mkdirSync(withoutDelta, { recursive: true });
    mkdirSync(withDelta, { recursive: true });

    writeFileSync(
      deltaPath,
      `${JSON.stringify(
        {
          generatedAt: '2026-11-20T00:00:00.000Z',
          repo: 'jovie',
          selectedTargets: [
            {
              id: preferredTargetId,
              module: 'Validation schemas',
              score: 12,
              lanes: ['unit'],
            },
          ],
          failures: [
            {
              testId: 'validation schemas property',
              lane: 'unit',
              file: 'apps/web/lib/validation/handle.ts',
              fingerprint: 'fixture-skill-delta',
            },
          ],
          mutation: {
            score: 40,
            killed: 2,
            survived: 3,
            total: 5,
          },
        },
        null,
        2
      )}\n`
    );

    const baseline = runSelect(withoutDelta, [
      '--skill-delta',
      path.join(root, 'missing-skill-delta.json'),
    ]);
    const preferred = runSelect(withDelta, ['--skill-delta', deltaPath]);

    expect(baseline.skillDeltaConsumed).toBe(false);
    expect(baseline.selectedTargets).toHaveLength(1);
    expect(baseline.selectedTargets[0]?.id).not.toBe(preferredTargetId);

    expect(preferred.skillDeltaConsumed).toBe(true);
    expect(preferred.skillDeltaPath).toContain('skill-delta.json');
    expect(preferred.selectedTargets).toHaveLength(1);
    expect(preferred.selectedTargets[0]?.id).toBe(preferredTargetId);
    expect(
      preferred.selectedTargets[0]?.scoreBreakdown.skillDelta
    ).toBeGreaterThan(0);
    expect(preferred.selectedTargets[0]?.reasons).toEqual(
      expect.arrayContaining(['Prior skill-delta target'])
    );
    expect(preferred.selectedTargets[0]?.score).toBeGreaterThan(
      baseline.selectedTargets[0]?.score ?? 0
    );
  });

  it('cannot silently ignore a skill-delta present on a default search path', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nightly-skill-delta-default-')
    );
    temporaryDirs.push(root);
    // Isolate default discovery by pointing --out at a temp tree under repo-relative prior path.
    // Use an explicit --skill-delta so the test does not depend on polluting the real reports dir.
    const outDir = path.join(root, 'out');
    const priorDir = path.join(root, 'prior');
    mkdirSync(priorDir, { recursive: true });
    const deltaPath = path.join(priorDir, 'skill-delta.json');
    writeFileSync(
      deltaPath,
      `${JSON.stringify({
        generatedAt: '2026-11-20T01:00:00.000Z',
        repo: 'jovie',
        selectedTargets: [
          {
            id: preferredTargetId,
            module: 'Validation schemas',
            score: 99,
            lanes: ['unit', 'mutation'],
          },
        ],
        failures: [],
      })}\n`
    );

    const result = runSelect(outDir, ['--skill-delta', deltaPath]);
    expect(result.skillDeltaConsumed).toBe(true);
    expect(existsSync(deltaPath)).toBe(true);
    expect(result.selectedTargets[0]?.id).toBe(preferredTargetId);
    // Receipt fields make silent ignore visible in CI artifacts.
    expect(result).toMatchObject({
      skillDeltaConsumed: true,
      skillDeltaPath: expect.stringContaining('skill-delta.json'),
    });
  });
});
