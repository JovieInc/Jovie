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
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyLockfileChange,
  classifyProductLanes,
  evaluateProductLaneResults,
  formatGitHubSummary,
  macLockfileGraph,
  ProductLaneClassificationError,
  runProductLaneClassifier,
} from '../product-lane-classifier.mjs';

const ALL = ['ios', 'mac', 'web', 'cross-product'];
const JS = ['mac', 'web', 'cross-product'];
const pkg = (before, after, desktop = {}) =>
  classifyProductLanes(['package.json'], {
    packageJsonBefore:
      typeof before === 'string' ? before : JSON.stringify(before),
    packageJsonAfter: typeof after === 'string' ? after : JSON.stringify(after),
    desktopPackageJsonBefore: desktop.before,
    desktopPackageJsonAfter: desktop.after,
  });

describe('product lane classifier', () => {
  it('routes native playbook-only changes through web checks', () => {
    expect(
      classifyProductLanes([
        'docs/playbooks/growth-presence-repair-offer.playbook.md',
      ]).selectedLanes
    ).toEqual(['web']);
    expect(
      classifyProductLanes(['docs/playbooks/TEMPLATE.md']).selectedLanes
    ).toEqual(['operations']);
  });
  it('routes the published CLI skill artifacts through the CLI web gate and rejects unknown skill paths', () => {
    const receipt = classifyProductLanes([
      'skills/jovie/SKILL.md',
      'skills/jovie/README.md',
      'skills/jovie/LICENSE',
    ]);
    expect(receipt.selectedLanes).toEqual(['web']);
    expect(
      receipt.classifications.every(item => item.rule === 'web-product')
    ).toBe(true);
    for (const path of [
      'skills/other/SKILL.md',
      'skills/jovie/setup.sh',
      'skills/jovie/../private.md',
      'skills/jovie/SKILL.md.extra',
    ]) {
      expect(() => classifyProductLanes([path])).toThrow(
        ProductLaneClassificationError
      );
    }
  });

  it('records the bounded blog qualification without admitting mixed paths', () => {
    const receipt = classifyProductLanes(
      ['apps/web/content/blog/a-safe-article.md'],
      { qualificationProfile: 'content-only' }
    );

    expect(receipt.qualificationProfile).toBe('content-only');
    expect(receipt.requiredGates.web.tests).toContain(
      'JOV-7396 publication contract'
    );
    expect(() =>
      classifyProductLanes(
        [
          'apps/web/content/blog/a-safe-article.md',
          'apps/web/lib/blog/getBlogPosts.ts',
        ],
        { qualificationProfile: 'content-only' }
      )
    ).toThrow('approved blog content paths');
  });

  it('builds and releases canonical changelog content through web while ordinary docs stay operational', () => {
    expect(classifyProductLanes(['CHANGELOG.md']).selectedLanes).toEqual([
      'web',
    ]);
    expect(
      classifyProductLanes(['docs/changelog.md', 'README.md']).selectedLanes
    ).toEqual(['operations']);
  });
  it('routes all canary OTP worker artifacts through the web gate and rejects unknown workers', () => {
    const receipt = classifyProductLanes([
      'workers/canary-otp/src/index.ts',
      'workers/canary-otp/src/index.test.mjs',
      'workers/canary-otp/package.json',
      'workers/canary-otp/tsconfig.json',
      'workers/canary-otp/wrangler.example.toml',
      'workers/canary-otp/README.md',
    ]);
    expect(receipt.selectedLanes).toEqual(['web']);
    expect(
      receipt.classifications.every(item => item.rule === 'web-product')
    ).toBe(true);
    expect(() =>
      classifyProductLanes(['workers/canary-otp-other/src/index.ts'])
    ).toThrow(ProductLaneClassificationError);
  });

  it('classifies retired knowledge-ingest paths as web after the workspace move', () => {
    const receipt = classifyProductLanes([
      'workers/knowledge-ingest/README.md',
      'workers/knowledge-ingest/package.json',
      'workers/knowledge-ingest/src/index.test.mjs',
      'workers/knowledge-ingest/src/index.ts',
      'workers/knowledge-ingest/src/source.ts',
      'workers/knowledge-ingest/src/transport.ts',
      'workers/knowledge-ingest/tsconfig.json',
      'workers/knowledge-ingest/wrangler.toml',
    ]);
    expect(receipt.selectedLanes).toEqual(['web']);
    expect(
      receipt.classifications.every(item => item.rule === 'web-product')
    ).toBe(true);
  });

  it('maps shared Jev evaluator-only edits to the consuming web and contract lanes', () => {
    const receipt = classifyProductLanes([
      'packages/jev-evaluation/gateway.mjs',
      'packages/jev-evaluation/package.json',
      'packages/jev-evaluation/gateway.test.mjs',
    ]);
    expect(receipt.selectedLanes).toEqual(['web', 'cross-product']);
    expect(
      receipt.classifications.every(
        item => item.rule === 'shared-jev-evaluation'
      )
    ).toBe(true);
    expect(() =>
      classifyProductLanes(['packages/jev-evaluation-other/gateway.mjs'])
    ).toThrow(ProductLaneClassificationError);
  });
  it('selects the consuming product and contract lane for agent transport changes', () => {
    const receipt = classifyProductLanes([
      'packages/agent-transport-contracts/index.ts',
      'packages/agent-transport-contracts/package.json',
    ]);
    expect(receipt.selectedLanes).toEqual(['web', 'cross-product']);
    expect(
      receipt.classifications.every(
        item => item.rule === 'shared-agent-transport'
      )
    ).toBe(true);
    expect(() =>
      classifyProductLanes(['packages/unknown-agent-tool/index.ts'])
    ).toThrow(ProductLaneClassificationError);
  });

  it('selects the web contract lane for canonical copy rule changes', () => {
    const receipt = classifyProductLanes([
      'packages/copy/rules.ts',
      'packages/copy/package.json',
    ]);
    expect(receipt.selectedLanes).toEqual(['web', 'cross-product']);
    expect(
      receipt.classifications.every(item => item.rule === 'shared-copy')
    ).toBe(true);
    expect(() =>
      classifyProductLanes(['packages/copywriter/index.ts'])
    ).toThrow(ProductLaneClassificationError);
  });

  it('selects the web product lane for brand construction sources', () => {
    const receipt = classifyProductLanes([
      'packages/brand/font/construction.py',
      'packages/brand/dist/geometry.json',
      'packages/brand/svg/jovie-mark-ink.svg',
    ]);
    expect(receipt.selectedLanes).toEqual(['web']);
    expect(
      receipt.classifications.every(item => item.rule === 'web-product')
    ).toBe(true);
    expect(() => classifyProductLanes(['packages/branding/index.ts'])).toThrow(
      ProductLaneClassificationError
    );
  });

  it('selects the web contract lane for release communications extraction', () => {
    const receipt = classifyProductLanes([
      'packages/release-communications/index.ts',
      'packages/release-communications/package.json',
    ]);
    expect(receipt.selectedLanes).toEqual(['web', 'cross-product']);
    expect(
      receipt.classifications.every(
        item => item.rule === 'shared-release-communications'
      )
    ).toBe(true);
  });

  it('keeps the allowlisted invariant addition operations-only', () => {
    const before = 'node scripts/invariants/validate.mjs';
    const receipt = pkg(
      {
        scripts: { 'invariants:check': before, 'ios:test': 'xcodebuild test' },
      },
      {
        scripts: {
          'invariants:check': `${before} && python3 scripts/fleet-gate/tests/codex-account-probe.test.py`,
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
              'node scripts/invariants/validate.mjs && python3 scripts/fleet-gate/tests/queue.test.py',
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

  it('skips the Mac lane for a root script the Mac job cannot run (JOV-6113)', () => {
    const desktop = {
      before: JSON.stringify({
        name: '@jovie/desktop',
        scripts: { test: 'node --test scripts/desktop.test.mjs' },
      }),
      after: JSON.stringify({
        name: '@jovie/desktop',
        scripts: { test: 'node --test scripts/desktop.test.mjs' },
      }),
    };
    const nodeTest = include =>
      `node --test --experimental-test-coverage --test-coverage-include=${include} --test-coverage-lines=95 --test-coverage-branches=90 --test-coverage-functions=100 ${include.replace(/\.mjs$/, '.test.mjs')}`;
    const before = {
      scripts: {
        'run-outcome:check': `${nodeTest('scripts/invariants/jev-writing-quality.mjs')} && pnpm evals:management-judgment`,
        'evals:management-judgment':
          'node scripts/evals/management-judgment.test.mjs',
      },
    };
    const after = {
      scripts: {
        'run-outcome:check': `${nodeTest('scripts/invariants/jev-writing-controller.mjs')} && ${nodeTest('scripts/invariants/jev-writing-quality.mjs')} && pnpm evals:management-judgment`,
        'evals:management-judgment':
          'node scripts/evals/management-judgment.test.mjs',
      },
    };
    const receipt = pkg(before, after, desktop);
    expect(receipt.selectedLanes).toEqual(['web', 'cross-product']);
    expect(receipt.classifications[0]).toMatchObject({
      rule: 'shared-js-workspace-web-only',
      affectedProducts: ['web'],
    });
    // No desktop evidence fails closed onto Mac.
    expect(pkg(before, after).selectedLanes).toEqual(JS);
    // Install hooks run on the Mac runner even when the command looks like a test.
    expect(
      pkg(
        { scripts: { prepare: 'node scripts/hooks/configure.mjs' } },
        { scripts: { prepare: 'node scripts/hooks/configure.mjs --strict' } },
        desktop
      ).selectedLanes
    ).toEqual(JS);
    // The desktop manifest calling the root script keeps Mac.
    expect(
      pkg(before, after, {
        ...desktop,
        after: JSON.stringify({
          name: '@jovie/desktop',
          scripts: { test: 'pnpm -w run run-outcome:check' },
        }),
      }).selectedLanes
    ).toEqual(JS);
    // A desktop wrapper that reaches the changed root script keeps Mac.
    expect(
      pkg(
        {
          scripts: {
            'run-outcome:check': 'node scripts/evals/outcome.test.mjs',
            'test:ci': 'pnpm run run-outcome:check',
          },
        },
        {
          scripts: {
            'run-outcome:check':
              'node scripts/evals/outcome.test.mjs && node scripts/evals/outcome-extra.test.mjs',
            'test:ci': 'pnpm run run-outcome:check',
          },
        },
        {
          before: JSON.stringify({
            scripts: { test: 'pnpm -w run test:ci' },
          }),
          after: JSON.stringify({
            scripts: { test: 'pnpm -w run test:ci' },
          }),
        }
      ).selectedLanes
    ).toEqual(JS);
    expect(
      pkg(before, after, {
        ...desktop,
        after: JSON.stringify({
          scripts: { test: 'npm run -w run-outcome:check' },
        }),
      }).selectedLanes
    ).toEqual(JS);
    expect(
      pkg(before, after, {
        ...desktop,
        after: JSON.stringify({
          scripts: { test: 'cd .. && pnpm run run-outcome:check' },
        }),
      }).selectedLanes
    ).toEqual(JS);
    // Ambiguous or Mac-surface commands keep Mac.
    for (const command of [
      'bash scripts/rebuild.sh',
      'node --eval "console.log(1)"',
      'node scripts/invariants/check.mjs || node scripts/invariants/other.mjs',
      'node scripts/a.test.mjs & node scripts/b.test.mjs',
      'node scripts/a.test.mjs && node $(echo scripts/b.test.mjs)',
      'node scripts/*.test.mjs',
      'pnpm --filter @jovie/desktop run test',
      'electron .',
    ]) {
      expect(
        pkg(
          {
            scripts: { 'ci:control:test': 'node scripts/ci/control.test.mjs' },
          },
          { scripts: { 'ci:control:test': command } },
          desktop
        ).selectedLanes,
        command
      ).toEqual(JS);
    }
    // A callee that names the desktop package keeps Mac.
    expect(
      pkg(
        {
          scripts: {
            'ci:control:test': 'pnpm ci:inner',
            'ci:inner': 'node scripts/ci/inner.test.mjs',
          },
        },
        {
          scripts: {
            'ci:control:test': 'pnpm ci:inner',
            'ci:inner': 'pnpm --filter @jovie/desktop run test',
          },
        },
        desktop
      ).selectedLanes
    ).toEqual(JS);
    // Dependency edits still select Mac, with or without desktop evidence.
    // A CI-only script edit beside a dependency edit does too: the Mac
    // runner installs that manifest.
    expect(
      pkg(
        {
          scripts: {
            'run-outcome:check': 'node scripts/evals/outcome.test.mjs',
          },
          devDependencies: { turbo: '1' },
        },
        {
          scripts: {
            'run-outcome:check':
              'node scripts/evals/outcome.test.mjs && node scripts/evals/extra.test.mjs',
          },
          devDependencies: { turbo: '2' },
        },
        desktop
      ).selectedLanes
    ).toEqual(JS);
    expect(
      pkg(
        { devDependencies: { turbo: '1' } },
        { devDependencies: { turbo: '2' } },
        desktop
      ).selectedLanes
    ).toEqual(JS);
  });

  it('locks the Mac lane to desktop-filtered pnpm so root scripts stay off that runner', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/macos-ci.yml', import.meta.url),
      'utf8'
    );
    const invocations = workflow
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('pnpm '));
    expect(invocations.length).toBeGreaterThan(0);
    for (const invocation of invocations) {
      expect(invocation).toContain('--filter @jovie/desktop');
    }
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
      'python3 scripts/fleet-gate/tests/../untrusted.test.py',
      'python3 scripts/fleet-gate/tests/probe.test.py --flag',
      'python3 scripts/fleet-gate/tests/probe.test.py; node scripts/untrusted.mjs',
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

  it('skips the Mac lane for lockfile changes that leave the desktop graph identical', () => {
    // A pnpm-lock v9 excerpt: desktop links packages/ui, uses an alias, and
    // shares `shared-dep` with web; web alone pulls `web-only`.
    const lock = ({
      shared = '1.0.0',
      webOnly = '2.0.0',
      uiDep = '3.0.0',
      electron = '6.8.9',
    }) =>
      [
        "lockfileVersion: '9.0'",
        '',
        'importers:',
        '',
        '  .:',
        '    devDependencies:',
        '      web-only:',
        '        specifier: ^2.0.0',
        `        version: ${webOnly}`,
        '',
        '  apps/desktop:',
        '    dependencies:',
        '      electron-updater:',
        '        specifier: ^6.8.9',
        `        version: ${electron}`,
        '      string-width-cjs:',
        '        specifier: npm:string-width@^4.2.0',
        '        version: string-width@4.2.3',
        "      '@jovie/ui':",
        '        specifier: workspace:*',
        '        version: link:../../packages/ui',
        '',
        '  packages/ui:',
        '    dependencies:',
        '      ui-dep:',
        '        specifier: ^3.0.0',
        `        version: ${uiDep}`,
        '',
        'packages:',
        '',
        `  electron-updater@${electron}:`,
        `    resolution: {integrity: sha512-electron-${electron}}`,
        '',
        `  shared-dep@${shared}:`,
        `    resolution: {integrity: sha512-shared-${shared}}`,
        '',
        'snapshots:',
        '',
        `  electron-updater@${electron}:`,
        '    dependencies:',
        `      shared-dep: ${shared}`,
        '',
        `  shared-dep@${shared}: {}`,
        '',
        '  string-width@4.2.3: {}',
        '',
        `  ui-dep@${uiDep}: {}`,
        '',
        `  web-only@${webOnly}:`,
        '    dependencies:',
        `      shared-dep: ${shared}`,
        '',
      ].join('\n');
    const base = lock({});
    expect(macLockfileGraph(base)).toContain('importer packages/ui');
    expect(macLockfileGraph(base)).toContain('snapshot string-width@4.2.3');
    expect(macLockfileGraph(base)).not.toContain('web-only');
    const full = ['shared-js-lockfile', 'shared-contract', ['mac', 'web']];
    expect(classifyLockfileChange(base, lock({ webOnly: '2.0.1' }))).toEqual([
      'shared-js-lockfile-web-only',
      'shared-contract',
      ['web'],
    ]);
    for (const after of [
      lock({ electron: '6.8.10' }), // direct desktop dependency
      lock({ shared: '1.0.1' }), // transitive dependency reached from desktop
      lock({ uiDep: '3.0.1' }), // dependency of a linked workspace package
    ])
      expect(classifyLockfileChange(base, after)).toEqual(full);
    // Fails closed: missing sources, unparseable text, a dangling snapshot key.
    expect(classifyLockfileChange(undefined, base)).toEqual(full);
    expect(classifyLockfileChange(base, 'lockfileVersion: 9')).toEqual(full);
    expect(
      classifyLockfileChange(
        base,
        base.replace('  string-width@4.2.3: {}\n', '')
      )
    ).toEqual(full);

    const webOnlyReceipt = classifyProductLanes(['pnpm-lock.yaml'], {
      lockfileBefore: base,
      lockfileAfter: lock({ webOnly: '2.0.1' }),
    });
    expect(webOnlyReceipt.selectedLanes).toEqual(['web', 'cross-product']);
    expect(webOnlyReceipt.sharedContract.affectedProducts).toEqual(['web']);
    expect(classifyProductLanes(['pnpm-lock.yaml']).selectedLanes).toEqual(JS);
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
        'node before.mjs && python3 scripts/fleet-gate/tests/probe.test.py'
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

  it('treats a missing desktop manifest as absent and a non-blob as unreadable', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-product-lane-desktop-'));
    const files = join(root, 'files.txt');
    const receipt = join(root, 'receipt.json');
    const git = args =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const writeRoot = command =>
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ scripts: { 'run-outcome:check': command } })}\n`
      );
    try {
      git(['init', '-q']);
      git(['config', 'user.name', 'Product Lane Test']);
      git(['config', 'user.email', 'product-lane@example.invalid']);
      git(['config', 'commit.gpgsign', 'false']);
      writeRoot('node scripts/evals/outcome.test.mjs');
      git(['add', 'package.json']);
      git(['commit', '-q', '-m', 'before']);
      const absentBase = git(['rev-parse', 'HEAD']);
      writeRoot(
        'node scripts/evals/outcome.test.mjs && node scripts/evals/extra.test.mjs'
      );
      git(['add', 'package.json']);
      git(['commit', '-q', '-m', 'after-absent']);
      const absentHead = git(['rev-parse', 'HEAD']);
      writeFileSync(files, 'package.json\n');
      const run = (baseRef, headRef) =>
        runProductLaneClassifier(
          [
            '--files-from',
            files,
            '--base-ref',
            baseRef,
            '--head-ref',
            headRef,
            '--json-out',
            receipt,
          ],
          { cwd: root }
        );
      run(absentBase, absentHead);
      expect(JSON.parse(readFileSync(receipt, 'utf8')).selectedLanes).toEqual([
        'web',
        'cross-product',
      ]);

      mkdirSync(join(root, 'apps/desktop'), { recursive: true });
      writeFileSync(
        join(root, 'apps/desktop/package.json'),
        `${JSON.stringify({ scripts: { test: 'node --test scripts/desktop.test.mjs' } })}\n`
      );
      writeRoot('node scripts/evals/outcome.test.mjs');
      git(['add', 'package.json', 'apps/desktop/package.json']);
      git(['commit', '-q', '-m', 'desktop-file']);
      const fileBase = git(['rev-parse', 'HEAD']);
      writeRoot(
        'node scripts/evals/outcome.test.mjs && node scripts/evals/extra.test.mjs'
      );
      git(['add', 'package.json']);
      git(['commit', '-q', '-m', 'desktop-file-after']);
      const fileHead = git(['rev-parse', 'HEAD']);
      run(fileBase, fileHead);
      expect(JSON.parse(readFileSync(receipt, 'utf8')).selectedLanes).toEqual([
        'web',
        'cross-product',
      ]);

      git(['rm', '-q', 'apps/desktop/package.json']);
      mkdirSync(join(root, 'apps/desktop/package.json'), { recursive: true });
      writeFileSync(
        join(root, 'apps/desktop/package.json/placeholder'),
        'not-a-manifest\n'
      );
      git(['add', 'apps/desktop/package.json']);
      git(['commit', '-q', '-m', 'desktop-tree']);
      const treeHead = git(['rev-parse', 'HEAD']);
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      run(fileBase, treeHead);
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('keeping the Mac lane')
      );
      expect(JSON.parse(readFileSync(receipt, 'utf8')).selectedLanes).toEqual(
        JS
      );
    } finally {
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires every product lane for release-channel contract files', () => {
    for (const file of [
      'index.ts',
      'package.json',
      'release-channel.test.ts',
      'tsconfig.json',
      'vitest.config.mts',
    ]) {
      expect(
        classifyProductLanes([`packages/release-channel-contracts/${file}`])
          .selectedLanes
      ).toEqual(ALL);
    }
    expect(() =>
      classifyProductLanes([
        'packages/release-channel-contracts-extra/index.ts',
      ])
    ).toThrow(ProductLaneClassificationError);
  });

  it('keeps JS workspace config off the native iOS lane', () => {
    for (const path of [
      'tsconfig.json',
      'turbo.json',
      'biome.json',
      'vitest.config.mts',
      'pnpm-workspace.yaml',
      '.nvmrc',
      '.node-version',
      '.npmrc',
      'patches/next@16.0.0.patch',
    ]) {
      expect(classifyProductLanes([path]).selectedLanes, path).toEqual([
        'mac',
        'web',
        'cross-product',
      ]);
    }
    expect(
      classifyProductLanes(['tsconfig.json', 'apps/ios/Jovie/App.swift'])
        .selectedLanes
    ).toEqual(ALL);
  });

  it('maps isolated, shared, and operations-only paths', () => {
    for (const [path, lanes] of /** @type {Array<[string, string[]]>} */ ([
      ['apps/ios/Jovie/App.swift', ['ios']],
      ['apps/desktop/src/main.ts', ['mac']],
      ['apps/web/app/page.tsx', ['web']],
      ['apps/ovie/app/page.tsx', ['web']],
      ['apps/ovie/proxy.ts', ['web']],
      ['apps/ovie/scripts/routes.mjs', ['web']],
      ['apps/ovie/vercel.json', ['web']],
      ['packages/jovie-cli/src/client.ts', ['web']],
      ['.github/workflows/ios-ci.yml', ['ios']],
      ['.github/workflows/desktop-release.yml', ['mac']],
      ['.github/workflows/production-release.yml', ['web']],
    ]))
      expect(classifyProductLanes([path]).selectedLanes).toEqual(lanes);
    expect(
      classifyProductLanes(['packages/auth-routing/index.ts']).selectedLanes
    ).toEqual(ALL);
    const releaseChannels = classifyProductLanes([
      'packages/release-channel-contracts/index.ts',
    ]);
    expect(releaseChannels.selectedLanes).toEqual(ALL);
    expect(
      releaseChannels.requiredGates['cross-product'].tests.split(' && ')
    ).toContain('pnpm --filter @jovie/release-channel-contracts test');
    expect(
      classifyProductLanes([
        '.github/workflows/ci.yml',
        '.github/ci-harness/manifest.json',
        'scripts/lib/product-lane-classifier.mjs',
        'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs',
      ]).selectedLanes
    ).toEqual(['operations']);
    // Workflow-only diffs stay off the web lane; the operations structural
    // lane runs apps/web/tests/unit/ci instead (ci-fast-lanes.test.mjs).
    expect(
      classifyProductLanes(['.github/workflows/pr-size-guard.yml'])
        .selectedLanes
    ).toEqual(['operations']);
    expect(
      classifyProductLanes(['ops/signals/gem-publisher-commission.request'])
        .selectedLanes
    ).toEqual(['operations']);
    // ops/ is mapped for future fleet signals; Path Changes still trusts main's
    // classifier, so new ops/* files need that mapping already on main.
    expect(
      classifyProductLanes(['ops/signals/example.request']).selectedLanes
    ).toEqual(['operations']);
  });

  it('runs the Mac and iOS builds when their workflows or routing change', () => {
    for (const [path, lanes] of /** @type {Array<[string, string[]]>} */ ([
      ['.github/workflows/mac-lane.yml', ['ios', 'mac', 'operations']],
      ['.github/workflows/mac-lane-route.yml', ['ios', 'mac', 'operations']],
      ['.github/scripts/mac-lane.sh', ['ios', 'mac', 'operations']],
      ['.github/workflows/macos-ci.yml', ['mac', 'operations']],
      ['.github/actions/setup-node-pnpm/action.yml', ['mac', 'operations']],
      ['scripts/generate-brand-assets.ts', ['mac', 'operations']],
    ]))
      expect(classifyProductLanes([path]).selectedLanes, path).toEqual(lanes);
  });

  it('selects the Mac lane for every file outside apps/desktop the desktop build reads', async () => {
    const { DESKTOP_DOGFOOD_INVENTORY } = await import(
      '../../../apps/desktop/scripts/desktop-dogfood-inventory.mjs'
    );
    const inventorySources = DESKTOP_DOGFOOD_INVENTORY.flatMap(
      surface => surface.sources
    ).filter(source => !source.startsWith('apps/desktop/'));
    expect(inventorySources.length).toBeGreaterThan(0);
    const consumed = [
      ...new Set([
        ...inventorySources,
        'apps/web/scripts/generate-brand-assets.ts',
        'apps/web/lib/brand/tokens.ts',
        'packages/ui/brand/geometry.gen.ts',
        'packages/ui/brand/jovie-o-geometry.ts',
        'apps/web/lib/design/generated/design-tokens.ts',
        'apps/web/styles/design-system.css',
        'apps/web/styles/system-b-app.css',
        'apps/web/data/marketing/routeManifest.ts',
        'apps/ios/Jovie/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json',
      ]),
    ];
    for (const path of consumed) {
      expect(existsSync(path), `${path} moved; update mac-consumed-*`).toBe(
        true
      );
      expect(
        classifyProductLanes([path]).selectedLanes,
        `${path} must select the Mac lane`
      ).toContain('mac');
    }
  });

  it('keeps ordinary web changes off the native lanes', () => {
    for (const path of [
      'apps/web/app/page.tsx',
      'apps/web/components/organisms/HeaderNav.tsx',
      'apps/web/styles/globals.css',
      'apps/web/lib/brand/primitives.tsx',
      'apps/web/scripts/dev-fast.mjs',
      'packages/ui/src/button.tsx',
    ])
      expect(classifyProductLanes([path]).selectedLanes, path).toEqual(['web']);
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
