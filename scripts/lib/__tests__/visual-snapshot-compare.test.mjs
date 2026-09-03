import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertVisualCompareWorkflowContract,
  classifyVisualSnapshotOutcome,
  expectedSnapshotDir,
  inventoryMissingBaselines,
  isMissingBaselineSignal,
  parseStaticScreenshotNames,
  runVisualSnapshotCompare,
  VISUAL_COMPARE_MODE,
  VISUAL_REFRESH_MODE,
  VISUAL_SNAPSHOT_SPECS,
} from '../visual-snapshot-compare.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

describe('visual snapshot compare (JOV-5459)', () => {
  it('treats missing baseline/ENOENT as fail in compare mode', () => {
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        error: { code: 'ENOENT', message: 'no such file' },
      })
    ).toMatchObject({ ok: false, status: 'fail', reason: 'missing-baseline' });
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        error: { message: "A snapshot doesn't exist at foo.png" },
      })
    ).toMatchObject({ ok: false, reason: 'missing-baseline' });
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        missingBaselinePaths: ['apps/web/tests/e2e/__snapshots__/missing.png'],
      })
    ).toMatchObject({ ok: false, reason: 'missing-baseline' });
  });

  it('never treats advisory success or --update-snapshots as a compare pass', () => {
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        advisory: true,
      })
    ).toMatchObject({
      ok: false,
      reason: 'compare-must-not-be-advisory',
    });
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        updateSnapshots: true,
      })
    ).toMatchObject({
      ok: false,
      reason: 'compare-must-not-update-snapshots',
    });
  });

  it('lets refresh self-heal missing baselines only with --update-snapshots', () => {
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_REFRESH_MODE,
        updateSnapshots: true,
        error: { code: 'ENOENT' },
      })
    ).toMatchObject({
      ok: true,
      status: 'refresh-update',
      reason: 'refresh-self-heal',
    });
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_REFRESH_MODE,
        updateSnapshots: false,
        error: { code: 'ENOENT' },
      })
    ).toMatchObject({ ok: false, reason: 'missing-baseline' });
  });

  it('detects Playwright missing-snapshot wording as ENOENT-equivalent', () => {
    expect(
      isMissingBaselineSignal({ message: "A snapshot doesn't exist" })
    ).toBe(true);
    expect(isMissingBaselineSignal({ code: 'ENOENT' })).toBe(true);
    expect(isMissingBaselineSignal({ message: 'pixels differ' })).toBe(false);
  });

  it('inventories static toHaveScreenshot names onto the Playwright snapshot path', () => {
    expect(
      parseStaticScreenshotNames("toHaveScreenshot('composer-empty.png')")
    ).toEqual(['composer-empty.png']);
    expect(
      parseStaticScreenshotNames(
        'toHaveScreenshot(`homepage-${viewport.label}.png`)'
      )
    ).toEqual([]);
    expect(expectedSnapshotDir('apps/web/tests/e2e/chat-visual.spec.ts')).toBe(
      'apps/web/tests/e2e/__snapshots__/chat-visual.spec.ts'
    );
    const files = {
      'apps/web/tests/e2e/chat-visual.spec.ts':
        "await expect(surface).toHaveScreenshot('composer-empty.png');\n",
    };
    expect(
      inventoryMissingBaselines({
        repoRoot: '/repo',
        specs: ['apps/web/tests/e2e/chat-visual.spec.ts'],
        existsSync: path =>
          path === '/repo/apps/web/tests/e2e/chat-visual.spec.ts' ||
          path === '/repo/apps/web/tests/e2e/__snapshots__/chat-visual.spec.ts',
        readFileSync: path => files[path.replace('/repo/', '')],
      })
    ).toEqual([
      'apps/web/tests/e2e/__snapshots__/chat-visual.spec.ts/composer-empty.png',
    ]);
  });

  it('passes the committed snapshot inventory and workflow contract', () => {
    const visualRegressionYaml = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/visual-regression.yml'),
      'utf8'
    );
    const ciYaml = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/ci.yml'),
      'utf8'
    );
    expect(
      inventoryMissingBaselines({
        repoRoot: REPO_ROOT,
        existsSync,
        readFileSync,
        specs: VISUAL_SNAPSHOT_SPECS,
      })
    ).toEqual([]);
    expect(
      assertVisualCompareWorkflowContract({ visualRegressionYaml, ciYaml })
    ).toEqual([]);
    expect(
      runVisualSnapshotCompare({
        repoRoot: REPO_ROOT,
        mode: VISUAL_COMPARE_MODE,
        existsSync,
        readFileSync,
        visualRegressionYaml,
        ciYaml,
      })
    ).toMatchObject({ ok: true, reason: 'matched' });
  });
});
