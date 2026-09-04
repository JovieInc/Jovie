import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyProductLanes,
  evaluateProductLaneResults,
  formatGitHubSummary,
  ProductLaneClassificationError,
  runProductLaneClassifier,
} from '../product-lane-classifier.mjs';

const SKIPPED_UNSELECTED = {
  operations: ['skipped'],
  'cross-product': ['skipped'],
};

describe('product lane classifier', () => {
  it('keeps operations-only package scripts off product build lanes', () => {
    const receipt = classifyProductLanes(['package.json'], {
      packageJsonBefore: JSON.stringify({
        scripts: {
          'invariants:check': 'node scripts/invariants/validate.mjs',
          'ios:test': 'bash apps/ios/scripts/run-xcodebuild.sh test',
        },
      }),
      packageJsonAfter: JSON.stringify({
        scripts: {
          'invariants:check':
            'node scripts/invariants/validate.mjs && python3 scripts/hermes/tests/codex-account-probe.test.py',
          'ios:test': 'bash apps/ios/scripts/run-xcodebuild.sh test',
        },
      }),
    });

    expect(receipt.selectedLanes).toEqual(['operations']);
    expect(receipt.classifications).toEqual([
      {
        path: 'package.json',
        category: 'operations-tooling',
        affectedProducts: [],
        rule: 'operations-package-scripts',
      },
    ]);
    expect(receipt.skippedLanes.map(item => item.lane)).toContain('ios');
  });

  it('fails closed onto product lanes for product or unresolved package edits', () => {
    const iosScript = classifyProductLanes(['package.json'], {
      packageJsonBefore: JSON.stringify({
        scripts: { 'ios:test': 'xcodebuild test' },
      }),
      packageJsonAfter: JSON.stringify({
        scripts: {
          'ios:test': 'xcodebuild test -parallel-testing-enabled YES',
        },
      }),
    });
    expect(iosScript.selectedLanes).toContain('ios');

    const disabledInvariant = classifyProductLanes(['package.json'], {
      packageJsonBefore: JSON.stringify({
        scripts: { 'invariants:check': 'node scripts/invariants/validate.mjs' },
      }),
      packageJsonAfter: JSON.stringify({
        scripts: { 'invariants:check': 'true' },
      }),
    });
    expect(disabledInvariant.selectedLanes).toEqual([
      'ios',
      'mac',
      'web',
      'cross-product',
    ]);

    for (const addition of [
      'node scripts/untrusted.mjs',
      'python3 scripts/hermes/tests/../untrusted.test.py',
      'python3 scripts/hermes/tests/probe.test.py --flag',
      'python3 scripts/hermes/tests/probe.test.py; node scripts/untrusted.mjs',
    ]) {
      const beforeCommand = 'node scripts/invariants/validate.mjs';
      const untrustedAddition = classifyProductLanes(['package.json'], {
        packageJsonBefore: JSON.stringify({
          scripts: { 'invariants:check': beforeCommand },
        }),
        packageJsonAfter: JSON.stringify({
          scripts: {
            'invariants:check': `${beforeCommand} && ${addition}`,
          },
        }),
      });
      expect(untrustedAddition.selectedLanes).toEqual([
        'ios',
        'mac',
        'web',
        'cross-product',
      ]);
      expect(untrustedAddition.classifications[0]?.rule).toBe(
        'shared-js-workspace'
      );
    }

    const productLikeCiScript = classifyProductLanes(['package.json'], {
      packageJsonBefore: JSON.stringify({
        scripts: { 'ci:ios-release': 'xcodebuild archive' },
      }),
      packageJsonAfter: JSON.stringify({
        scripts: {
          'ci:ios-release': 'xcodebuild archive --configuration Release',
        },
      }),
    });
    expect(productLikeCiScript.selectedLanes).toEqual([
      'ios',
      'mac',
      'web',
      'cross-product',
    ]);

    const dependency = classifyProductLanes(['package.json'], {
      packageJsonBefore: JSON.stringify({ dependencies: { react: '1' } }),
      packageJsonAfter: JSON.stringify({ dependencies: { react: '2' } }),
    });
    expect(dependency.selectedLanes).toEqual([
      'ios',
      'mac',
      'web',
      'cross-product',
    ]);

    expect(classifyProductLanes(['package.json']).selectedLanes).toEqual([
      'ios',
      'mac',
      'web',
      'cross-product',
    ]);

    expect(
      classifyProductLanes(['package.json'], {
        packageJsonBefore: '{not-json',
        packageJsonAfter: '{}',
      }).selectedLanes
    ).toEqual(['ios', 'mac', 'web', 'cross-product']);

    expect(
      classifyProductLanes(['package.json'], {
        packageJsonBefore: 'null',
        packageJsonAfter: '{}',
      }).selectedLanes
    ).toEqual(['ios', 'mac', 'web', 'cross-product']);

    expect(
      classifyProductLanes(['package.json'], {
        packageJsonBefore: JSON.stringify({ scripts: 'not-an-object' }),
        packageJsonAfter: JSON.stringify({ scripts: {} }),
      }).selectedLanes
    ).toEqual(['ios', 'mac', 'web', 'cross-product']);

    for (const invalidValue of [null, {}, [], 42]) {
      for (const [beforeValue, afterValue] of [
        ['node before.mjs', invalidValue],
        [invalidValue, 'node after.mjs'],
      ]) {
        const invalidScript = classifyProductLanes(['package.json'], {
          packageJsonBefore: JSON.stringify({
            scripts: { 'invariants:check': beforeValue },
          }),
          packageJsonAfter: JSON.stringify({
            scripts: { 'invariants:check': afterValue },
          }),
        });
        expect(invalidScript.selectedLanes).toEqual([
          'ios',
          'mac',
          'web',
          'cross-product',
        ]);
        expect(invalidScript.classifications[0]?.rule).toBe(
          'shared-js-workspace-unresolved'
        );
      }
    }

    expect(
      classifyProductLanes(['package.json'], {
        packageJsonBefore: JSON.stringify({ scripts: {} }),
        packageJsonAfter: JSON.stringify({}),
      }).selectedLanes
    ).toEqual(['ios', 'mac', 'web', 'cross-product']);
  });

  it('keeps the iOS lane off lockfile-only churn', () => {
    // Every dependabot group touches pnpm-lock.yaml; the iOS lane is native
    // xcodebuild with no causal path from the JS install graph, so dependency
    // bumps must not pay for it in the merge queue.
    const lockfileOnly = classifyProductLanes(['pnpm-lock.yaml']);
    expect(lockfileOnly.selectedLanes).not.toContain('ios');
    expect(lockfileOnly.selectedLanes).toEqual(
      expect.arrayContaining(['mac', 'web'])
    );
    expect(lockfileOnly.classifications[0]?.rule).toBe('shared-js-lockfile');

    // A dependabot-shaped diff (manifest + lockfile) still skips iOS.
    const dependabotBump = classifyProductLanes([
      'apps/web/package.json',
      'pnpm-lock.yaml',
    ]);
    expect(dependabotBump.selectedLanes).not.toContain('ios');

    // Root package.json script edits keep full coverage (release wiring).
    const rootManifest = classifyProductLanes(['package.json'], {
      packageJsonBefore: JSON.stringify({ scripts: {} }),
      packageJsonAfter: JSON.stringify({}),
    });
    expect(rootManifest.selectedLanes).toContain('ios');
  });

  it('loads package script changes from the supplied git refs', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-product-lane-git-'));
    const files = join(root, 'files.txt');
    const receiptPath = join(root, 'receipt.json');
    const git = args =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

    try {
      git(['init', '-q']);
      git(['config', 'user.name', 'Product Lane Test']);
      git(['config', 'user.email', 'product-lane@example.invalid']);
      git(['config', 'commit.gpgsign', 'false']);
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ scripts: { 'invariants:check': 'node before.mjs' } }, null, 2)}\n`
      );
      git(['add', 'package.json']);
      git(['commit', '-q', '-m', 'before']);
      const baseRef = git(['rev-parse', 'HEAD']);

      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ scripts: { 'invariants:check': 'node before.mjs && python3 scripts/hermes/tests/codex-account-probe.test.py' } }, null, 2)}\n`
      );
      git(['add', 'package.json']);
      git(['commit', '-q', '-m', 'after']);
      const headRef = git(['rev-parse', 'HEAD']);
      writeFileSync(files, 'package.json\n');

      runProductLaneClassifier(
        [
          '--files-from',
          files,
          '--base-ref',
          baseRef,
          '--head-ref',
          headRef,
          '--json-out',
          receiptPath,
        ],
        { cwd: root }
      );
      expect(
        JSON.parse(readFileSync(receiptPath, 'utf8')).selectedLanes
      ).toEqual(['operations']);

      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      runProductLaneClassifier(
        [
          '--files-from',
          files,
          '--base-ref',
          'missing-ref',
          '--head-ref',
          headRef,
          '--json-out',
          receiptPath,
        ],
        { cwd: root }
      );
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('selecting every product lane')
      );
      expect(
        JSON.parse(readFileSync(receiptPath, 'utf8')).selectedLanes
      ).toEqual(['ios', 'mac', 'web', 'cross-product']);
      warning.mockRestore();
    } finally {
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('selects only the isolated product lane', () => {
    const ios = classifyProductLanes(['apps/ios/Jovie/App.swift']);
    expect(ios.selectedLanes).toEqual(['ios']);
    expect(ios.skippedLanes.map(item => item.lane)).toEqual([
      'mac',
      'web',
      'operations',
      'cross-product',
    ]);

    const mac = classifyProductLanes(['apps/desktop/src/main.ts']);
    expect(mac.selectedLanes).toEqual(['mac']);
    expect(mac.skippedLanes.map(item => item.lane)).toContain('ios');
    expect(mac.skippedLanes.map(item => item.lane)).toContain('web');

    const web = classifyProductLanes(['apps/web/app/page.tsx']);
    expect(web.selectedLanes).toEqual(['web']);
    expect(web.skippedLanes.map(item => item.lane)).toContain('ios');
    expect(web.skippedLanes.map(item => item.lane)).toContain('mac');

    const cli = classifyProductLanes(['packages/jovie-cli/src/client.ts']);
    expect(cli.selectedLanes).toEqual(['web']);
  });

  it('names every affected product and cross-product gate for shared contracts', () => {
    const receipt = classifyProductLanes(['packages/auth-routing/index.ts']);
    expect(receipt.sharedContract).toEqual({
      changed: true,
      affectedProducts: ['ios', 'mac', 'web'],
      paths: ['packages/auth-routing/index.ts'],
    });
    expect(receipt.selectedLanes.join(',')).toBe('ios,mac,web,cross-product');
  });

  it('bootstraps admission-control repairs through operations evidence only', () => {
    const receipt = classifyProductLanes([
      '.github/workflows/ci.yml',
      '.github/ci-harness/manifest.json',
      'scripts/ci-fast-lanes.mjs',
      'scripts/lib/product-lane-classifier.mjs',
      'scripts/lib/production-lane-range.mjs',
      'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs',
      'scripts/lib/__tests__/production-lane-range.test.mjs',
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);

    expect(receipt.selectedLanes).toEqual(['operations']);
    expect(receipt.sharedContract).toEqual({
      changed: false,
      affectedProducts: [],
      paths: [],
    });
    expect(receipt.skippedLanes.map(item => item.lane)).toEqual([
      'ios',
      'mac',
      'web',
      'cross-product',
    ]);

    expect(
      classifyProductLanes(['.github/workflows/ios-ci.yml']).selectedLanes
    ).toEqual(['ios']);
    expect(
      classifyProductLanes(['.github/workflows/desktop-release.yml'])
        .selectedLanes
    ).toEqual(['mac']);
    expect(
      classifyProductLanes(['.github/workflows/production-release.yml'])
        .selectedLanes
    ).toEqual(['web']);
  });

  it('keeps a broken isolated product from blocking unrelated unselected lanes', () => {
    for (const [broken, path] of Object.entries({
      ios: 'apps/ios/Jovie/App.swift',
      mac: 'apps/desktop/src/main.ts',
      web: 'apps/web/app/page.tsx',
    })) {
      const receipt = classifyProductLanes([path]);
      const results = {
        ios: ['skipped'],
        mac: ['skipped'],
        web: ['skipped'],
        ...SKIPPED_UNSELECTED,
        [broken]: ['failure'],
      };
      const evaluation = evaluateProductLaneResults(receipt, results);
      expect(evaluation.aggregatePassed, broken).toBe(false);
      expect(evaluation.admissions[broken].selected, broken).toBe(true);
      expect(evaluation.independentlyShippableProducts, broken).toEqual([]);
      for (const lane of ['ios', 'mac', 'web'].filter(
        item => item !== broken
      )) {
        expect(evaluation.admissions[lane].selected, `${broken}->${lane}`).toBe(
          false
        );
        expect(evaluation.admissions[lane].passed, `${broken}->${lane}`).toBe(
          false
        );
      }
    }
  });

  it('keeps a healthy selected product independently shippable when another is red', () => {
    const receipt = classifyProductLanes(['packages/auth-routing/index.ts']);
    const green = {
      ios: ['success'],
      mac: ['success'],
      web: ['success', 'success'],
      operations: ['skipped'],
      'cross-product': ['success'],
    };
    for (const [broken, independentlyShippable] of Object.entries({
      ios: ['mac', 'web'],
      mac: ['ios', 'web'],
      web: ['ios', 'mac'],
      'cross-product': [],
    })) {
      const result = evaluateProductLaneResults(receipt, {
        ...green,
        [broken]: ['failure'],
      });
      expect(result.aggregatePassed, broken).toBe(false);
      expect(result.independentlyShippableProducts, broken).toEqual(
        independentlyShippable
      );
    }
  });

  it('fails closed when an unselected lane reports a non-skipped result', () => {
    const receipt = classifyProductLanes(['apps/ios/Jovie/App.swift']);
    expect(() =>
      evaluateProductLaneResults(receipt, {
        ios: ['success'],
        web: ['failure'],
      })
    ).toThrow('Unselected web lane produced a non-skipped result');
  });

  it('fails closed with a visible classification error for unknown paths', () => {
    expect(() => classifyProductLanes(['new-product/main.ts'])).toThrow(
      ProductLaneClassificationError
    );
    expect(() => classifyProductLanes(['new-product/main.ts'])).toThrow(
      'Unmapped changed paths: new-product/main.ts'
    );
  });

  it('keeps every tracked repository path explicitly mapped', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
    expect(() => classifyProductLanes(tracked)).not.toThrow();
  });

  it('emits the complete human-readable and machine-readable intake receipt', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-product-lanes-'));
    const files = join(root, 'files.txt');
    const json = join(root, 'receipt.json');
    const summary = join(root, 'summary.md');
    const outputs = join(root, 'github-output.txt');

    try {
      writeFileSync(files, 'packages/auth-routing/index.ts\ndocs/ci.md\n');
      runProductLaneClassifier([
        '--files-from',
        files,
        '--json-out',
        json,
        '--summary-out',
        summary,
        '--github-output',
        outputs,
      ]);

      const receipt = JSON.parse(readFileSync(json, 'utf8'));
      expect(receipt.authority).toBe('Summer');
      expect(receipt.selectedLanes.join(',')).toBe(
        'ios,mac,web,operations,cross-product'
      );
      expect(readFileSync(summary, 'utf8')).toBe(formatGitHubSummary(receipt));
      expect(readFileSync(outputs, 'utf8')).toContain('run_web=true');
      expect(readFileSync(outputs, 'utf8')).toContain('run_macos=true');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
