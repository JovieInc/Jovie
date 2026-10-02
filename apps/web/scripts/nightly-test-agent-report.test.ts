// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';

describe('nightly producer report aggregation', () => {
  it('retains both same-named producer reports and their missing-evidence warnings', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nightly-report-'));
    const originalArgv = process.argv;
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../..'
    );
    const workflow = load(
      readFileSync(
        path.join(repoRoot, '.github/workflows/nightly-testing-agent.yml'),
        'utf8'
      )
    ) as {
      jobs: {
        report: {
          steps: { name?: string; with?: { 'merge-multiple'?: boolean } }[];
        };
      };
    };
    const merge = workflow.jobs.report.steps.find(
      step => step.name === 'Download agent artifacts'
    )?.with?.['merge-multiple'];
    try {
      const incoming = path.join(root, 'incoming');
      for (const [artifact, lane, count, warnings] of [
        ['nightly-agent-deterministic-1-123', 'unit', 17, []],
        [
          'nightly-agent-mutation-123',
          'mutation',
          0,
          ['Missing mutation report'],
        ],
      ] as const) {
        const directory = merge ? incoming : path.join(incoming, artifact);
        mkdirSync(directory, { recursive: true });
        writeFileSync(
          path.join(directory, 'normalized-results.json'),
          JSON.stringify({
            generatedAt: '2026-10-01T16:31:02Z',
            repo: 'jovie',
            inputs: [],
            warnings,
            suites: [
              {
                lane,
                total: count,
                passed: count,
                failed: 0,
                flaky: 0,
                skipped: 0,
                durationMs: 70,
              },
            ],
            failures: [],
          })
        );
      }
      process.argv = [
        'node',
        'nightly-test-agent.ts',
        'emit-delta',
        '--input-dir',
        incoming,
        '--out',
        path.join(root, 'out'),
        '--workflow-conclusion',
        'cancelled',
      ];
      await import('./nightly-test-agent');
      const report = readFileSync(
        path.join(root, 'out/nightly-report.md'),
        'utf8'
      );
      expect(report).toContain('| unit | 17 | 17 | 0 | 0 | 0 |');
      expect(report).toContain('| mutation | 0 | 0 | 0 | 0 | 0 |');
      expect(report).toContain('Missing mutation report');
      expect(report).toContain('Workflow conclusion: cancelled');
    } finally {
      process.argv = originalArgv;
      rmSync(root, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
