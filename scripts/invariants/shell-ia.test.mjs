import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  compareDebt,
  measureDebt,
  readBaseline,
  readRegistry,
  validateShellIa,
} from './shell-ia.mjs';

function write(root, rel, text) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** Minimal repo: one app route mounting the shell through its layout. */
function fixture({
  layoutRendersShell = true,
  pageChrome = '',
  navItems = 'a, b',
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'shell-ia-'));
  write(
    root,
    'apps/web/components/organisms/Shell.tsx',
    'export function Shell({ children }) { return <div>{children}</div>; }\n'
  );
  write(
    root,
    'apps/web/components/organisms/Header.tsx',
    'export function Header() { return null; }\n'
  );
  write(
    root,
    'apps/web/nav.ts',
    `export const primaryNavigation = [${navItems}];\n`
  );
  write(
    root,
    'apps/web/app/app/layout.tsx',
    layoutRendersShell
      ? "import { Shell } from '@/components/organisms/Shell';\nexport default function L({ children }) { return <Shell>{children}</Shell>; }\n"
      : 'export default function L({ children }) { return <main>{children}</main>; }\n'
  );
  write(
    root,
    'apps/web/app/app/page.tsx',
    `export default function P() { return <div>${pageChrome}</div>; }\n`
  );
  const registry = {
    primitives: {
      appShell: { source: 'components/organisms/Shell.tsx', export: 'Shell' },
      pageHeader: {
        source: 'components/organisms/Header.tsx',
        export: 'Header',
      },
    },
    surfaces: [
      {
        id: 'app',
        shell: 'appShell',
        header: 'pageHeader',
        navigation: {
          source: 'nav.ts',
          export: 'primaryNavigation',
          maxRootItems: 4,
        },
        routes: ['/app'],
      },
    ],
    chromeOwners: ['components/organisms/'],
  };
  return { root, registry };
}

const EMPTY = { rawChrome: {}, plateSubNav: {} };

test('accepts a route that mounts its surface shell through the layout', () => {
  const { root, registry } = fixture();
  const result = validateShellIa({ root, registry, baseline: EMPTY });
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
});

test('deliberate red: rejects a route whose layout skips the surface shell', () => {
  const { root, registry } = fixture({ layoutRendersShell: false });
  const result = validateShellIa({ root, registry, baseline: EMPTY });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some(f => f.kind === 'shell-unreachable'));
});

test('deliberate red: rejects new ad-hoc nav chrome in route code', () => {
  const { root, registry } = fixture({
    pageChrome: '<nav aria-label="x"></nav>',
  });
  const result = validateShellIa({ root, registry, baseline: EMPTY });
  assert.ok(result.findings.some(f => f.kind === 'rawChrome-new'));
});

test('deliberate red: rejects a plate-rail sub-navigation in an app route', () => {
  const { root, registry } = fixture({
    pageChrome: '<RouteSegmentControl value="a" options={[]} />',
  });
  const result = validateShellIa({ root, registry, baseline: EMPTY });
  assert.ok(result.findings.some(f => f.kind === 'plateSubNav-new'));
});

test('accepts the flat ghost sub-navigation treatment', () => {
  const { root, registry } = fixture({
    pageChrome:
      '<RouteSegmentControl surface=\'ghost\' value="a" options={[]} />',
  });
  assert.deepEqual(measureDebt({ root, registry }).plateSubNav, {});
});

test('deliberate red: rejects a fifth root navigation item', () => {
  const { root, registry } = fixture({ navItems: 'a, b, c, d, e' });
  const result = validateShellIa({ root, registry, baseline: EMPTY });
  assert.ok(result.findings.some(f => f.kind === 'navigation-over-cap'));
});

test('deliberate red: rejects a primitive that no longer exports its name', () => {
  const { root, registry } = fixture();
  registry.primitives.pageHeader.export = 'Missing';
  const result = validateShellIa({ root, registry, baseline: EMPTY });
  assert.ok(result.findings.some(f => f.kind === 'missing-export'));
});

test('deliberate red: ratchet fails growth and only notes a shrink', () => {
  const notices = [];
  const findings = compareDebt(
    { rawChrome: { a: 2 }, plateSubNav: {} },
    { rawChrome: { a: 1, b: 1 }, plateSubNav: {} },
    notices
  );
  assert.deepEqual(
    findings.map(f => f.kind),
    ['rawChrome-grew']
  );
  assert.deepEqual(
    notices.map(n => n.kind),
    ['rawChrome-shrank']
  );
});

test('the committed registry and baseline hold on this checkout', () => {
  const result = validateShellIa({
    registry: readRegistry(),
    baseline: readBaseline(),
  });
  assert.deepEqual(result.findings, []);
});
