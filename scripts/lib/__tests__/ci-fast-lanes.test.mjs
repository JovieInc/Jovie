import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LANE_COMMANDS,
  runDesignConformance,
  runStructural,
} from '../../ci-fast-lanes.mjs';

const SCREENSHOT_CATALOG_COMMAND =
  'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/ci/screenshot-catalog-pr-workflow.test.ts';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('CI control selector', () => {
  it('includes the structural execution regressions in the actual control command', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-ci-control-selector-'));
    const capture = join(directory, 'commands');
    try {
      writeFileSync(join(directory, 'node'), '#!/bin/sh\nexit 0\n', {
        mode: 0o755,
      });
      writeFileSync(
        join(directory, 'pnpm'),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$JOVIE_CI_CAPTURE"\n',
        { mode: 0o755 }
      );

      const result = spawnSync(
        process.execPath,
        [join(REPO_ROOT, 'scripts/run-affected-tests.mjs'), '--control'],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            JOVIE_CI_CAPTURE: capture,
          },
          encoding: 'utf8',
          timeout: 10_000,
        }
      );
      expect(result.status, result.stderr).toBe(0);
      const scriptCommand = readFileSync(capture, 'utf8')
        .split('\n')
        .find(command => command.startsWith('exec vitest --root scripts '));
      expect(scriptCommand).toBeDefined();
      expect(scriptCommand.split(' ')).toContain(
        'lib/__tests__/ci-fast-lanes.test.mjs'
      );
      expect(scriptCommand).toContain('--coverage');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('runDesignConformance', () => {
  const originalEventName = process.env.GITHUB_EVENT_NAME;

  afterEach(() => {
    process.env.GITHUB_EVENT_NAME = originalEventName;
    vi.clearAllMocks();
  });

  it('skips on eve-pilot-only changed files', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    const execute = vi.fn().mockReturnValue({
      code: 0,
      output: 'executed',
    });

    const result = runDesignConformance({
      changedFileList: ['apps/eve-pilot/some-ui-changes.swift'],
      execute,
    });

    expect(result.code).toBe(0);
    expect(result.skipped).toBe(true);
    expect(result.output).toContain(
      'Design conformance skipped (no design-domain files changed)'
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs for iOS design-domain files (for example AppShellTabBar.swift)', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    const execute = vi.fn().mockReturnValue({
      code: 0,
      output: 'executed',
    });

    const result = runDesignConformance({
      changedFileList: ['apps/ios/Scenes/AppShell/AppShellTabBar.swift'],
      execute,
    });

    expect(result.code).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(LANE_COMMANDS['design-conformance']);
    expect(result.skipped).toBeUndefined();
  });

  it('fails closed when changed files are unavailable', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    const execute = vi.fn().mockReturnValue({
      code: 0,
      output: 'executed',
    });

    const result = runDesignConformance({
      changedFileList: null,
      execute,
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('failed: changed files unavailable');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('runStructural screenshot contract discovery', () => {
  const originalEventName = process.env.GITHUB_EVENT_NAME;
  const originalProductLanes = process.env.CI_PRODUCT_LANES;
  const originalSkipStructural = process.env.CI_FAST_SKIP_STRUCTURAL;

  afterEach(() => {
    for (const [name, value] of [
      ['GITHUB_EVENT_NAME', originalEventName],
      ['CI_PRODUCT_LANES', originalProductLanes],
      ['CI_FAST_SKIP_STRUCTURAL', originalSkipStructural],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.clearAllMocks();
  });

  it.each([
    ['web', true],
    ['operations', true],
    ['web,operations', true],
    ['ios', false],
  ])(
    'runs the screenshot contract once for selected lanes %s',
    (lanes, expected) => {
      process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
      process.env.CI_PRODUCT_LANES = lanes;
      process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
      const execute = vi
        .fn()
        .mockReturnValue({ code: 0, output: 'executed\n' });

      const result = runStructural({ execute });
      const screenshotCalls = execute.mock.calls.filter(
        ([command]) => command === SCREENSHOT_CATALOG_COMMAND
      );

      expect(result.code).toBe(0);
      expect(screenshotCalls).toHaveLength(expected ? 1 : 0);
      if (expected) {
        expect(execute.mock.calls[0][0]).toBe(SCREENSHOT_CATALOG_COMMAND);
      } else {
        expect(result.skipped).toBe(true);
        expect(execute).not.toHaveBeenCalled();
      }
    }
  );

  it('runs on a pull request changing the PR Size Guard workflow', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi.fn().mockReturnValue({ code: 0, output: 'executed\n' });

    const result = runStructural({
      changedFileList: ['.github/workflows/pr-size-guard.yml'],
      execute,
    });

    expect(result.code).toBe(0);
    expect(result.skipped).toBeUndefined();
    expect(execute.mock.calls[0][0]).toBe(SCREENSHOT_CATALOG_COMMAND);
  });

  it('stops before later structural commands when the screenshot contract fails', () => {
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi
      .fn()
      .mockReturnValue({ code: 17, output: 'fixture drift\n' });

    expect(runStructural({ execute })).toMatchObject({
      code: 17,
      output: 'fixture drift\n',
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith(SCREENSHOT_CATALOG_COMMAND);
  });
});
