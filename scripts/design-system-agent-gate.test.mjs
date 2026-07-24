import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildAtomCollisionIndex,
  evaluateDesignSystemAgentGate,
  evaluateFile,
  listUiAtomNames,
} from './design-system-agent-gate.mjs';

test('lists real @jovie/ui atoms from packages/ui/atoms', () => {
  const atoms = listUiAtomNames();
  assert.ok(atoms.includes('button'));
  assert.ok(atoms.includes('input'));
  assert.ok(atoms.includes('badge'));
  assert.ok(atoms.includes('dialog'));
  assert.ok(atoms.includes('card'));
  assert.ok(!atoms.includes('button.stories'));
});

test('flags raw hex outside token sources', () => {
  const index = buildAtomCollisionIndex(['button']);
  const findings = evaluateFile(
    'apps/web/components/features/demo/Bad.tsx',
    `export function Bad() { return <div className="text-[#ff00aa] bg-[#000]" /> }`,
    index,
    { isAdded: false }
  );
  assert.equal(
    findings.some(f => f.rule === 'no-raw-hex-outside-tokens'),
    true
  );
});

test('allows hex inside design-system.css and packages/ui/theme', () => {
  const index = buildAtomCollisionIndex(['button']);
  for (const file of [
    'apps/web/styles/design-system.css',
    'packages/ui/theme/tokens.ts',
  ]) {
    const findings = evaluateFile(
      file,
      `:root { --accent: #7170ff; } const c = '#ffffff';`,
      index,
      { isAdded: false }
    );
    assert.equal(
      findings.filter(f => f.rule === 'no-raw-hex-outside-tokens').length,
      0,
      file
    );
  }
});

test('flags banned motion classes but not token motion', () => {
  const index = buildAtomCollisionIndex([]);
  const bad = evaluateFile(
    'apps/web/components/atoms/BadMotion.tsx',
    `const c = 'hover:scale-105 transition-all duration-300';`,
    index,
    { isAdded: false }
  );
  assert.equal(
    bad.some(f => f.rule === 'no-banned-motion-classes'),
    true
  );

  const good = evaluateFile(
    'apps/web/components/atoms/GoodMotion.tsx',
    `const c = 'transition-colors duration-subtle ease-subtle';`,
    index,
    { isAdded: false }
  );
  assert.equal(
    good.some(f => f.rule === 'no-banned-motion-classes'),
    false
  );
});

test('flags new duplicate @jovie/ui atom filenames that do not re-export', () => {
  const index = buildAtomCollisionIndex(['button', 'input', 'badge']);
  const dup = evaluateFile(
    'apps/web/components/atoms/Button.tsx',
    `export function Button() { return <button type="button" /> }`,
    index,
    { isAdded: true }
  );
  assert.equal(
    dup.some(f => f.rule === 'no-duplicate-ui-atom'),
    true
  );

  const wrap = evaluateFile(
    'apps/web/components/atoms/Badge.tsx',
    `import { Badge as Base } from '@jovie/ui';\nexport const Badge = Base;`,
    index,
    { isAdded: true }
  );
  assert.equal(
    wrap.some(f => f.rule === 'no-duplicate-ui-atom'),
    false
  );
});

test('flags System A / design-studio story imports', () => {
  const index = buildAtomCollisionIndex([]);
  const findings = evaluateFile(
    'apps/web/components/features/x/Story.tsx',
    [
      `import x from '@/components/design-studio/Foo.stories';`,
      `import y from 'something/linear-marketing';`,
      `const c = 'linear-marketing dark';`,
    ].join('\n'),
    index,
    { isAdded: false }
  );
  const rules = new Set(findings.map(f => f.rule));
  assert.ok(rules.has('no-design-studio-stories'));
  assert.ok(rules.has('no-system-a-linear-marketing-import'));
  assert.ok(rules.has('no-linear-marketing-class'));
});

test('evaluateDesignSystemAgentGate scans supplied fixture files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ds-agent-gate-'));
  try {
    const file = 'apps/web/components/features/demo/OffSystem.tsx';
    const abs = join(root, file);
    mkdirSync(join(root, 'apps/web/components/features/demo'), {
      recursive: true,
    });
    mkdirSync(join(root, 'packages/ui/atoms'), { recursive: true });
    writeFileSync(
      join(root, 'packages/ui/atoms/button.tsx'),
      'export const Button = () => null;\n'
    );
    writeFileSync(
      abs,
      `export function OffSystem() {\n  return <div className="text-[#cafe00] hover:scale-110 transition-all duration-500" />;\n}\n`
    );

    const result = evaluateDesignSystemAgentGate({
      root,
      mode: 'changed',
      changedFiles: [file],
      addedFiles: [],
      atomNames: ['button'],
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.findings.some(f => f.rule === 'no-raw-hex-outside-tokens')
    );
    assert.ok(result.findings.some(f => f.rule === 'no-banned-motion-classes'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('current repository changed-set gate is callable', () => {
  const result = evaluateDesignSystemAgentGate({ mode: 'changed' });
  assert.equal(typeof result.ok, 'boolean');
  assert.equal(typeof result.scanned, 'number');
  assert.ok(Array.isArray(result.findings));
});
