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

const ALL = ['ios', 'mac', 'web', 'cross-product'];
const JS = ['mac', 'web', 'cross-product'];
const pkg = (before, after) =>
  classifyProductLanes(['package.json'], {
    packageJsonBefore:
      typeof before === 'string' ? before : JSON.stringify(before),
    packageJsonAfter: typeof after === 'string' ? after : JSON.stringify(after),
  });

describe('product lane classifier', () => {
  it('keeps the allowlisted invariant addition operations-only', () => {
    const before = 'node scripts/invariants/validate.mjs';
    const receipt = pkg(
      {
        scripts: { 'invariants:check': before, 'ios:test': 'xcodebuild test' },
      },
      {
        scripts: {
          'invariants:check': `${before} && python3 scripts/hermes/tests/codex-account-probe.test.py`,
          'ios:test': 'xcodebuild test',
        },
      }
    );
    expect(receipt.selectedLanes).toEqual(['operations']);
    expect(receipt.classifications[0]).toMatchObject({
      category: 'operations-tooling',
      affectedProducts: [],
      rule: 'operations-package-scripts',
    });
  });

  it('keeps JS lanes for dependency and non-iOS script changes', () => {
    expect(
      pkg(
        {
          scripts: {
            'invariants:check': 'node scripts/invariants/validate.mjs',
          },
          devDependencies: { turbo: '1' },
        },
        {
          scripts: {
            'invariants:check':
              'node scripts/invariants/validate.mjs && python3 scripts/hermes/tests/queue.test.py',
          },
          devDependencies: { turbo: '2' },
        }
      ).selectedLanes
    ).toEqual(JS);
    expect(
      pkg(
        { devDependencies: { turbo: '1' } },
        { devDependencies: { turbo: '2' } }
      ).selectedLanes
    ).toEqual(JS);
    expect(pkg({ scripts: {} }, {}).selectedLanes).toEqual(JS);
  });

  it('selects iOS for direct, forward-alias, and reverse-alias changes', () => {
    const cases = [
      [
        { scripts: { 'ios:test': 'xcodebuild test' } },
        { scripts: { 'ios:test': 'xcodebuild test -quiet' } },
      ],
      [
        {
          scripts: {
            native: 'pnpm run mac',
            'test:auth:ios': 'bash apps/ios/scripts/run-auth-tests.sh',
          },
        },
        {
          scripts: {
            native: 'pnpm run mac && pnpm -s run test:auth:ios',
            'test:auth:ios': 'bash apps/ios/scripts/run-auth-tests.sh',
          },
        },
      ],
      [
        {
          scripts: {
            shared: 'node scripts/auth.mjs',
            'test:auth:ios': 'pnpm run shared && xcodebuild test',
          },
        },
        {
          scripts: {
            shared: 'node scripts/auth.mjs --strict',
            'test:auth:ios': 'pnpm run shared && xcodebuild test',
          },
        },
      ],
    ];
    for (const [before, after] of cases)
      expect(pkg(before, after).selectedLanes).toContain('ios');
  });

  it('fails closed for unresolved or unsafe manifest edits', () => {
    const before = 'node scripts/invariants/validate.mjs';
    const unsafe = [
      'node scripts/untrusted.mjs',
      'python3 scripts/hermes/tests/../untrusted.test.py',
      'python3 scripts/hermes/tests/probe.test.py --flag',
      'python3 scripts/hermes/tests/probe.test.py; node scripts/untrusted.mjs',
    ];
    const receipts = [
      classifyProductLanes(['package.json']),
      pkg('{not-json', '{}'),
      pkg('null', '{}'),
      pkg({ scripts: 'invalid' }, { scripts: {} }),
      pkg(
        { scripts: { 'invariants:check': before } },
        { scripts: { 'invariants:check': 'true' } }
      ),
      ...unsafe.map(command =>
        pkg(
          { scripts: { 'invariants:check': before } },
          { scripts: { 'invariants:check': `${before} && ${command}` } }
        )
      ),
      ...[null, {}, [], 42].flatMap(value => [
        pkg(
          { scripts: { 'invariants:check': 'node before.mjs' } },
          { scripts: { 'invariants:check': value } }
        ),
        pkg(
          { scripts: { 'invariants:check': value } },
          { scripts: { 'invariants:check': 'node after.mjs' } }
        ),
      ]),
    ];
    for (const receipt of receipts) expect(receipt.selectedLanes).toEqual(ALL);
  });

  it('seals the fast iOS receipt and skips iOS for JS lockfiles', () => {
    const summary = formatGitHubSummary(
      classifyProductLanes(['apps/ios/Jovie/App.swift'])
    );
    for (const value of [
      'apps/ios/scripts/run-unit-tests.sh',
      'apps/ios/scripts/check_coverage.sh',
      'ios-test-results-<merge-group-head-sha>',
    ])
      expect(summary).toContain(value);
    expect(summary).not.toContain('ios-screenshots');
    for (const paths of [
      ['pnpm-lock.yaml'],
      ['apps/web/package.json', 'pnpm-lock.yaml'],
    ])
      expect(classifyProductLanes(paths).selectedLanes).not.toContain('ios');
  });

  it('loads package changes from git refs and fails closed on a missing ref', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-product-lane-git-'));
    const files = join(root, 'files.txt');
    const receipt = join(root, 'receipt.json');
    const git = args =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    try {
      git(['init', '-q']);
      git(['config', 'user.name', 'Product Lane Test']);
      git(['config', 'user.email', 'product-lane@example.invalid']);
      git(['config', 'commit.gpgsign', 'false']);
      const writePackage = command =>
        writeFileSync(
          join(root, 'package.json'),
          `${JSON.stringify({ scripts: { 'invariants:check': command } })}\n`
        );
      writePackage('node before.mjs');
      git(['add', 'package.json']);
      git(['commit', '-q', '-m', 'before']);
      const base = git(['rev-parse', 'HEAD']);
      writePackage(
        'node before.mjs && python3 scripts/hermes/tests/probe.test.py'
      );
      git(['add', 'package.json']);
      git(['commit', '-q', '-m', 'after']);
      const head = git(['rev-parse', 'HEAD']);
      writeFileSync(files, 'package.json\n');
      const run = baseRef =>
        runProductLaneClassifier(
          [
            '--files-from',
            files,
            '--base-ref',
            baseRef,
            '--head-ref',
            head,
            '--json-out',
            receipt,
          ],
          { cwd: root }
        );
      run(base);
      expect(JSON.parse(readFileSync(receipt, 'utf8')).selectedLanes).toEqual([
        'operations',
      ]);
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      run('missing-ref');
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('selecting every product lane')
      );
      expect(JSON.parse(readFileSync(receipt, 'utf8')).selectedLanes).toEqual(
        ALL
      );
    } finally {
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('maps isolated, shared, and operations-only paths', () => {
    for (const [path, lanes] of [
      ['apps/ios/Jovie/App.swift', ['ios']],
      ['apps/desktop/src/main.ts', ['mac']],
      ['apps/web/app/page.tsx', ['web']],
      ['packages/jovie-cli/src/client.ts', ['web']],
      ['.github/workflows/ios-ci.yml', ['ios']],
      ['.github/workflows/desktop-release.yml', ['mac']],
      ['.github/workflows/production-release.yml', ['web']],
    ])
      expect(classifyProductLanes([path]).selectedLanes).toEqual(lanes);
    expect(
      classifyProductLanes(['packages/auth-routing/index.ts']).selectedLanes
    ).toEqual(ALL);
    expect(
      classifyProductLanes([
        '.github/workflows/ci.yml',
        '.github/ci-harness/manifest.json',
        'scripts/lib/product-lane-classifier.mjs',
        'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs',
      ]).selectedLanes
    ).toEqual(['operations']);
  });

  it('evaluates failures without admitting skipped products', () => {
    for (const [broken, path] of Object.entries({
      ios: 'apps/ios/Jovie/App.swift',
      mac: 'apps/desktop/src/main.ts',
      web: 'apps/web/app/page.tsx',
    })) {
      const result = evaluateProductLaneResults(classifyProductLanes([path]), {
        ios: ['skipped'],
        mac: ['skipped'],
        web: ['skipped'],
        operations: ['skipped'],
        'cross-product': ['skipped'],
        [broken]: ['failure'],
      });
      expect(result.aggregatePassed).toBe(false);
      expect(result.admissions[broken].selected).toBe(true);
      expect(result.independentlyShippableProducts).toEqual([]);
    }
    const shared = classifyProductLanes(['packages/auth-routing/index.ts']);
    const green = {
      ios: ['success'],
      mac: ['success'],
      web: ['success'],
      operations: ['skipped'],
      'cross-product': ['success'],
    };
    for (const [broken, shippable] of Object.entries({
      ios: ['mac', 'web'],
      mac: ['ios', 'web'],
      web: ['ios', 'mac'],
      'cross-product': [],
    }))
      expect(
        evaluateProductLaneResults(shared, {
          ...green,
          [broken]: ['failure'],
        }).independentlyShippableProducts
      ).toEqual(shippable);
    expect(() =>
      evaluateProductLaneResults(
        classifyProductLanes(['apps/ios/Jovie/App.swift']),
        { ios: ['success'], web: ['failure'] }
      )
    ).toThrow('Unselected web lane produced a non-skipped result');
  });

  it('rejects unknown paths and maps every tracked path', () => {
    expect(() => classifyProductLanes(['new-product/main.ts'])).toThrow(
      ProductLaneClassificationError
    );
    const tracked = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
    expect(() => classifyProductLanes(tracked)).not.toThrow();
  });

  it('writes human-readable and machine-readable receipts', () => {
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
      expect(readFileSync(summary, 'utf8')).toBe(formatGitHubSummary(receipt));
      expect(readFileSync(outputs, 'utf8')).toContain('run_web=true');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
