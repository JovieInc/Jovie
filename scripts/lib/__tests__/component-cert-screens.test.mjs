import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll as after, describe, it } from 'vitest';
import {
  currentDebt,
  debtEntry,
  evaluateScreenGates,
  formatScreenGate,
  isCustomerUi,
  owedCriteria,
  readBaseScreens,
  screenComponents,
  screenIssues,
  sortByPath,
  unsortedPathErrors,
} from '../component-cert-screens.mjs';
import {
  importClosure,
  parseModule,
  routeEntries,
} from '../component-import-closure.mjs';

const root = mkdtempSync(join(tmpdir(), 'cert-screens-'));
after(() => rmSync(root, { recursive: true, force: true }));
function file(rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

file(
  'apps/web/app/layout.tsx',
  "import { Shell } from '@/components/Shell';\n"
);
file(
  'apps/web/app/claim/page.tsx',
  [
    "import type { Props } from '@/types/props';",
    "import { Button } from '@jovie/ui';",
    "import { ClaimCard } from '../../components/ClaimCard';",
    "const Lazy = dynamic(() => import('@/components/LazyPanel'));",
    '// import { Ghost } from "@/components/Ghost";',
  ].join('\n')
);
file('apps/web/components/Shell.tsx', 'export function Shell() {}\n');
file('apps/web/components/ClaimCard.tsx', 'export const ClaimCard = 1;\n');
file('apps/web/components/LazyPanel.tsx', 'export default function P() {}\n');
file('apps/web/components/Ghost.tsx', 'export const Ghost = 1;\n');
file('apps/web/components/ClaimCard.test.tsx', 'test\n');
file(
  'packages/ui/index.ts',
  [
    "export { Button } from './atoms/button';",
    "export { Dialog } from './atoms/dialog';",
    "export * from './atoms/more';",
  ].join('\n')
);
file('packages/ui/atoms/button.tsx', 'export function Button() {}\n');
file('packages/ui/atoms/dialog.tsx', 'export function Dialog() {}\n');
file('packages/ui/atoms/more.ts', 'export const More = 1;\n');

const registry = (debt = {}) => ({
  schema: 'jovie.cert-screens/v1',
  criteria: ['tests', 'a11y'],
  screens: { 'claim/claim': { page: 'apps/web/app/claim/page.tsx' } },
  debt,
});
const cert = (component, tests, a11y = 'pass') => ({
  component,
  criteria: [
    { id: 'tests', status: tests },
    { id: 'a11y', status: a11y },
  ],
});

describe('import closure', () => {
  it('follows the page, its layouts, aliases, relative and dynamic imports', () => {
    const entries = routeEntries(root, 'apps/web/app/claim/page.tsx');
    assert.deepEqual(entries, [
      'apps/web/app/claim/page.tsx',
      'apps/web/app/layout.tsx',
    ]);
    const { components, unresolved } = importClosure(root, entries);
    assert.deepEqual(components, [
      'apps/web/components/ClaimCard.tsx',
      'apps/web/components/LazyPanel.tsx',
      'apps/web/components/Shell.tsx',
      'packages/ui/atoms/button.tsx',
    ]);
    assert.deepEqual(unresolved, []);
  });

  it('follows a barrel by name, so Dialog stays out when only Button is used', () => {
    const { files } = importClosure(root, ['apps/web/app/claim/page.tsx']);
    assert.ok(!files.includes('packages/ui/atoms/dialog.tsx'));
    assert.ok(!files.includes('packages/ui/atoms/more.ts'));
    assert.ok(!files.includes('apps/web/components/Ghost.tsx'));
  });

  it('skips type-only imports and reads export lists', () => {
    const mod = parseModule(
      "import type { A } from './a';\nexport { B as C } from './b';\nexport const D = 1;"
    );
    assert.deepEqual(mod.imports, []);
    assert.deepEqual(mod.reexports, [
      { spec: './b', names: ['C'], sources: { C: 'B' } },
    ]);
    assert.ok(mod.localExports.has('D'));
  });
});

describe('import closure edge cases', () => {
  it('does not read a side-effect import as the next import clause', () => {
    const mod = parseModule(
      "import './globals.css';\nimport { Button } from '@jovie/ui';"
    );
    assert.deepEqual(mod.imports, [
      { spec: '@jovie/ui', names: ['Button'] },
      { spec: './globals.css', names: null },
    ]);
  });

  it('follows an aliased re-export to the source name', () => {
    file('apps/web/components/alias/Real.tsx', 'export function Real() {}\n');
    file(
      'apps/web/components/alias/index.ts',
      "export { Real as Shown } from './Real';\n"
    );
    file(
      'apps/web/app/alias/page.tsx',
      "import { Shown } from '@/components/alias';\n"
    );
    const { components } = importClosure(root, ['apps/web/app/alias/page.tsx']);
    assert.ok(components.includes('apps/web/components/alias/Real.tsx'));
  });
});

describe('screen gate', () => {
  const byScreen = screenComponents(root, registry());
  const passing = byScreen.get('claim/claim').map(c => cert(c, 'pass'));
  const withFailure = component =>
    passing.map(c => (c.component === component ? cert(component, 'fail') : c));

  it('passes a screen whose components all pass', () => {
    const result = evaluateScreenGates(
      { certificates: passing },
      registry(),
      byScreen
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.perScreen, [
      {
        id: 'claim/claim',
        route: null,
        stage: null,
        components: 4,
        passing: 4,
        gate: 'must-pass',
      },
    ]);
  });

  it('blocks a failure that is not in debt, and lets enrolled debt stand', () => {
    const report = {
      certificates: withFailure('apps/web/components/ClaimCard.tsx'),
    };
    const blocked = evaluateScreenGates(report, registry(), byScreen);
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.failures, [
      {
        component: 'apps/web/components/ClaimCard.tsx',
        screens: ['claim/claim'],
        criteria: ['tests'],
      },
    ]);
    const owed = registry({ 'apps/web/components/ClaimCard.tsx': ['tests'] });
    assert.equal(evaluateScreenGates(report, owed, byScreen).ok, true);
    assert.match(
      formatScreenGate(blocked),
      /ClaimCard\.tsx \[tests\] on claim\/claim/
    );
    assert.equal(blocked.failures[0].missingStates, undefined);
  });

  it('names the missing states on a states failure', () => {
    const component = 'apps/web/components/ClaimCard.tsx';
    const certificates = byScreen.get('claim/claim').map(path => ({
      component: path,
      criteria: [
        { id: 'tests', status: 'pass' },
        { id: 'a11y', status: 'pass' },
        {
          id: 'states',
          status: path === component ? 'fail' : 'pass',
          states:
            path === component
              ? {
                  error: { status: 'fail' },
                  loading: { status: 'waived', reason: 'held in a test' },
                }
              : { error: { status: 'pass' } },
        },
      ],
    }));
    const screens = { ...registry(), criteria: ['tests', 'a11y', 'states'] };
    const result = evaluateScreenGates({ certificates }, screens, byScreen);
    assert.deepEqual(result.failures, [
      {
        component,
        screens: ['claim/claim'],
        criteria: ['states'],
        missingStates: ['error'],
      },
    ]);
    assert.match(
      formatScreenGate(result),
      /ClaimCard\.tsx \[states missing error\] on claim\/claim/
    );
  });

  it('treats a component with no certificate as failing every criterion', () => {
    const report = { certificates: passing.slice(1) };
    const result = evaluateScreenGates(report, registry(), byScreen);
    assert.deepEqual(result.failures[0].criteria, ['tests', 'a11y']);
  });

  it('fails a screen whose page is missing, and an unknown stage', () => {
    const missing = {
      ...registry(),
      screens: {
        'claim/claim': { page: 'apps/web/app/claim/page.tsx', stage: 'claim' },
        'typo/page': { page: 'apps/web/app/nope/page.tsx', stage: 'paid' },
        'odd/stage': { page: 'apps/web/app/claim/page.tsx', stage: 'later' },
      },
    };
    const map = screenComponents(root, missing);
    assert.deepEqual(map.get('typo/page'), []);
    const result = evaluateScreenGates({ certificates: passing }, missing, map);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some(e => /typo\/page: page .* is missing/.test(e))
    );
    assert.ok(result.errors.some(e => /odd\/stage: stage must be/.test(e)));
  });

  it('flags debt that is paid or no longer rendered', () => {
    const owed = registry({
      'apps/web/components/ClaimCard.tsx': ['tests'],
      'apps/web/components/Removed.tsx': ['a11y'],
    });
    const result = evaluateScreenGates(
      { certificates: passing },
      owed,
      byScreen
    );
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.stale.map(s => s.component),
      ['apps/web/components/ClaimCard.tsx', 'apps/web/components/Removed.tsx']
    );
  });

  it('refuses debt growth against the base unless the screen is new', () => {
    const report = {
      certificates: withFailure('apps/web/components/ClaimCard.tsx'),
    };
    const owed = registry({ 'apps/web/components/ClaimCard.tsx': ['tests'] });
    const grown = evaluateScreenGates(report, owed, byScreen, registry());
    assert.equal(grown.ok, false);
    assert.match(
      grown.errors[0],
      /debt for apps\/web\/components\/ClaimCard.tsx grew/
    );
    const enrolling = { ...registry(), screens: {}, debt: {} };
    assert.equal(
      evaluateScreenGates(report, owed, byScreen, enrolling).ok,
      true
    );
  });

  it('lets debt grow only for a criterion the base registry did not list', () => {
    const report = {
      certificates: withFailure('apps/web/components/ClaimCard.tsx'),
    };
    const owed = registry({ 'apps/web/components/ClaimCard.tsx': ['tests'] });
    const before = { ...registry(), criteria: ['a11y'] };
    assert.equal(evaluateScreenGates(report, owed, byScreen, before).ok, true);
    const dropped = evaluateScreenGates(
      { certificates: passing },
      { ...registry(), criteria: ['a11y'] },
      byScreen,
      registry()
    );
    assert.equal(dropped.ok, false);
    assert.match(dropped.errors[0], /criterion tests was removed/);
  });

  it('ranks issues by screens then fewest criteria, and debt mirrors them', () => {
    const report = {
      certificates: passing.map(c =>
        c.component === 'apps/web/components/Shell.tsx'
          ? cert(c.component, 'fail', 'unknown')
          : c.component === 'apps/web/components/ClaimCard.tsx'
            ? cert(c.component, 'fail')
            : c
      ),
    };
    const issues = screenIssues(report, registry(), byScreen);
    assert.deepEqual(
      issues.map(i => [i.component, i.criteria]),
      [
        ['apps/web/components/ClaimCard.tsx', ['tests']],
        ['apps/web/components/Shell.tsx', ['tests', 'a11y']],
      ]
    );
    assert.match(
      issues[0].spec,
      /--component apps\/web\/components\/ClaimCard.tsx --spec$/
    );
    assert.deepEqual(currentDebt(report, registry(), byScreen), {
      'apps/web/components/ClaimCard.tsx': 'tests',
      'apps/web/components/Shell.tsx': 'a11y,tests',
    });
  });

  it('reads debt as a comma string or an array, and writes it sorted', () => {
    assert.deepEqual(owedCriteria('a11y, states,tests'), [
      'a11y',
      'states',
      'tests',
    ]);
    assert.deepEqual(owedCriteria(['tests']), ['tests']);
    assert.deepEqual(owedCriteria(undefined), []);
    assert.equal(debtEntry(['tests', 'a11y', 'tests']), 'a11y,tests');
  });

  it('keeps debt sorted by path in code-unit order, so entries land in place', () => {
    const shell = 'apps/web/app/app/(shell)/';
    const sorted = sortByPath({
      [`${shell}DashboardLoadTracker.tsx`]: 'a11y',
      [`${shell}chat/ChatPageClient.tsx`]: 'states',
      'apps/web/app/[username]/X.tsx': 'tests',
    });
    // Code-unit order: uppercase and `[` sort before lowercase letters.
    assert.deepEqual(Object.keys(sorted), [
      'apps/web/app/[username]/X.tsx',
      `${shell}DashboardLoadTracker.tsx`,
      `${shell}chat/ChatPageClient.tsx`,
    ]);
    assert.deepEqual(unsortedPathErrors('debt', sorted), []);
    const [error] = unsortedPathErrors('debt', { b: 'x', a: 'y', c: 'z' });
    assert.match(
      error,
      /debt is not sorted by component path \(a comes after b\)/
    );
    assert.match(error, /node scripts\/component-certificate\.mjs --sort/);
    const report = { certificates: [] };
    const byScreen = new Map([['claim/claim', ['B.tsx', 'A.tsx']]]);
    const owed = registry({ 'B.tsx': 'tests,a11y', 'A.tsx': 'tests,a11y' });
    const unsorted = evaluateScreenGates(report, owed, byScreen);
    assert.equal(unsorted.ok, false);
    assert.match(
      unsorted.errors.join('\n'),
      /cert-screens: debt is not sorted/
    );
    const ok = evaluateScreenGates(
      report,
      { ...owed, debt: sortByPath(owed.debt) },
      byScreen
    );
    assert.equal(ok.ok, true, JSON.stringify(ok));
  });
});

describe('base registry', () => {
  it('reads debt at the merge base, so debt paid on main later is not growth', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cert-screens-git-'));
    try {
      const git = (...args) =>
        execFileSync(
          'git',
          ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
          {
            cwd: repo,
            stdio: 'pipe',
          }
        );
      const rel = 'cert-screens.json';
      const write = debt =>
        writeFileSync(join(repo, rel), JSON.stringify({ debt }));
      git('init', '-q', '-b', 'main');
      write({ A: 'a11y,tests' });
      git('add', '.');
      git('commit', '-qm', 'base');
      git('checkout', '-qb', 'feature');
      git('checkout', '-q', 'main');
      write({ A: 'tests' });
      git('commit', '-qam', 'paid on main');
      git('checkout', '-q', 'feature');
      assert.deepEqual(readBaseScreens(repo, rel, 'main').debt, {
        A: 'a11y,tests',
      });
      assert.equal(readBaseScreens(repo, rel, 'missing-ref'), null);
      assert.equal(readBaseScreens(repo, rel, null), null);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('customer UI scope', () => {
  it('counts drawn components and leaves out providers, pixels and dev tools', () => {
    assert.equal(
      isCustomerUi('apps/web/components/molecules/EmptyState.tsx'),
      true
    );
    assert.equal(
      isCustomerUi('apps/web/app/[username]/_components/Hero.tsx'),
      true
    );
    assert.equal(isCustomerUi('packages/ui/atoms/button.tsx'), true);
    assert.equal(
      isCustomerUi('apps/web/components/providers/QueryProvider.tsx'),
      false
    );
    assert.equal(
      isCustomerUi('apps/web/components/features/dev/DevToolbar.tsx'),
      false
    );
    assert.equal(
      isCustomerUi('apps/web/components/tracking/MetaPixel.tsx'),
      false
    );
    assert.equal(isCustomerUi('apps/web/lib/brand/primitives.tsx'), false);
    assert.equal(
      isCustomerUi('apps/web/components/providers/GoogleAnalytics.tsx'),
      false
    );
    assert.equal(
      isCustomerUi('apps/web/components/providers/ErrorBoundary.tsx'),
      true
    );
  });

  it('drops a context file only when it creates a context', () => {
    const rel = 'apps/web/components/shell/HeaderSearchSurfaceFromContext.tsx';
    assert.equal(
      isCustomerUi(rel, 'export function X() { return <div />; }'),
      true
    );
    assert.equal(
      isCustomerUi(
        'apps/web/components/organisms/PendingShellContext.tsx',
        'const Ctx = createContext<Value | null>(null);'
      ),
      false
    );
    assert.equal(isCustomerUi(rel), true);
  });
});
