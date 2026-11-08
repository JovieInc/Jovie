import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll as after, describe, it } from 'vitest';
import {
  currentDebt,
  evaluateScreenGates,
  isCustomerUi,
  screenComponents,
  screenIssues,
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
    assert.deepEqual(mod.reexports, [{ spec: './b', names: ['B'] }]);
    assert.ok(mod.localExports.has('D'));
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
      { id: 'claim/claim', components: 4, passing: 4 },
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
  });

  it('treats a component with no certificate as failing every criterion', () => {
    const report = { certificates: passing.slice(1) };
    const result = evaluateScreenGates(report, registry(), byScreen);
    assert.deepEqual(result.failures[0].criteria, ['tests', 'a11y']);
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
      'apps/web/components/ClaimCard.tsx': ['tests'],
      'apps/web/components/Shell.tsx': ['tests', 'a11y'],
    });
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
  });
});
