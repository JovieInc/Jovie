import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkLayoutGuardContracts } from './layout-guard-pen-contracts.mjs';

const SPEC = 'tests/e2e/marketing-faq-width-invariance.spec.ts';

function fixture(pageSource) {
  const root = mkdtempSync(path.join(tmpdir(), 'pen-contract-'));
  const write = (rel, text) => {
    const file = path.join(root, 'apps/web', rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  write(
    SPEC,
    `const ROUTES = [{ label: 'about', path: '/about' }];\nconst s = page.locator(\x27[data-pen-contract='pAAhw']\x27);\n`
  );
  write('tests/e2e/hud-scroll.spec.ts', '');
  write(
    'data/marketing/penContracts.ts',
    'export const MARKETING_PEN_CONTRACT_IDS = { section: { faq: \x27pAAhw\x27 } };\n'
  );
  write(
    'components/marketing/FaqSection.tsx',
    'import { MARKETING_PEN_CONTRACT_IDS } from \x27@/data/marketing/penContracts\x27;\nexport function FaqSection() { return <section data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.faq} />; }\n'
  );
  write(
    'components/marketing/Other.tsx',
    'export function Other() { return <p />; }\n'
  );
  write(
    'components/marketing/index.ts',
    'export { FaqSection } from \x27./FaqSection\x27;\nexport { Other } from \x27./Other\x27;\n'
  );
  write('app/(marketing)/about/page.tsx', pageSource);
  return root;
}

test('red: /about no longer renders the FAQ a required layout spec locates', () => {
  const root = fixture(
    'import { Other } from \x27@/components/marketing\x27;\nexport default function P() { return <Other />; }\n'
  );
  try {
    const { failures } = checkLayoutGuardContracts({ root });
    assert.equal(failures.length, 1);
    assert.equal(failures[0].route, '/about');
    assert.equal(failures[0].id, 'pAAhw');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('green: page renders the FAQ through a barrel import', () => {
  const root = fixture(
    'import { FaqSection } from \x27@/components/marketing\x27;\nexport default function P() { return <FaqSection />; }\n'
  );
  try {
    assert.deepEqual(checkLayoutGuardContracts({ root }).failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unresolved: a contract with no source emitter is reported, not failed', () => {
  const root = fixture('export default function P() { return null; }\n');
  try {
    writeFileSync(
      path.join(root, 'apps/web', SPEC),
      "const ROUTES = [{ path: \x27/about\x27 }];\npage.locator(\x27[data-pen-contract='zzzzz']\x27);\n"
    );
    const result = checkLayoutGuardContracts({ root });
    assert.deepEqual(result.failures, []);
    assert.equal(result.unresolved[0].id, 'zzzzz');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
