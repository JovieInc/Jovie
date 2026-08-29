import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readInvariantRegistry } from './registry.mjs';
import {
  classifyScreenPath,
  DELIBERATE_RED_FIXTURES,
  EXCLUDED_OWNERS,
  evaluateChangedScreens,
  evaluateScreenProof,
  makeScreenProof,
  RETAINED_SWEEP_WORKFLOWS,
  runScreenCertification,
  SCREEN_CERT_INVARIANT_ID,
  SCREEN_CERT_SCHEMA,
  SCREEN_PLATFORMS,
  SCREEN_REGISTRY,
  validateRetainedSweeps,
  validateScreenRegistry,
} from './screen-certification.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const gated = () => SCREEN_REGISTRY.filter(entry => !entry.excluded);
const home = () => SCREEN_REGISTRY.find(e => e.id === 'web.homepage');
const kindOf = path => classifyScreenPath(path).kind;
function findings(patch, screen = gated()[0]) {
  const proof = { ...makeScreenProof(screen, HEAD), ...patch };
  return evaluateScreenProof(proof, { screen, headSha: HEAD }).join('\n');
}

describe('JOV-INV-018 screen-certification/v1', () => {
  it('registers typed screen ownership across web, macOS Electron, and iOS', () => {
    assert.deepEqual(validateScreenRegistry(), []);
    const platforms = [...new Set(gated().map(e => e.platform))].sort();
    assert.deepEqual(platforms, [...SCREEN_PLATFORMS].sort());
    for (const owner of EXCLUDED_OWNERS) {
      assert.ok(SCREEN_REGISTRY.some(e => e.excluded && e.owner === owner));
    }
    assert.equal(kindOf('apps/desktop/src/ovie-door.ts'), 'excluded');
    assert.equal(
      kindOf('apps/desktop/src/desktop-auth-security.ts'),
      'excluded'
    );
    assert.equal(kindOf('apps/macos/MenuMonitor/Package.swift'), 'excluded');
    assert.equal(
      kindOf('apps/ios/Jovie/Features/AppShell/AppShellView.swift'),
      'excluded'
    );
    assert.equal(kindOf('apps/web/app/(home)/page.tsx'), 'registered');
  });

  it('emits exact-head changed-surface receipts', () => {
    const result = runScreenCertification({
      headSha: HEAD,
      changedFiles: ['apps/web/app/(home)/page.tsx'],
    });
    assert.equal(result.ok, true, result.receipt.issues.join('\n'));
    assert.equal(result.receipt.headSha, HEAD);
    assert.equal(result.receipt.invariant, SCREEN_CERT_INVARIANT_ID);
    assert.equal(result.receipt.schema, SCREEN_CERT_SCHEMA);
    const rows = result.receipt.changedScreens.map(i => [i.id, i.verdict]);
    assert.deepEqual(rows, [['web.homepage', 'pass']]);
  });

  it('retains scheduled whole-system sweeps', () => {
    assert.deepEqual(validateRetainedSweeps(), []);
    for (const workflow of RETAINED_SWEEP_WORKFLOWS) {
      const text = readFileSync(resolve(ROOT, workflow.path), 'utf8');
      assert.match(text, /\n  schedule:\n/);
      const cron = workflow.cron.replace(/\*/g, '\\*');
      assert.match(text, new RegExp(cron));
    }
    const dropped = validateRetainedSweeps({
      workflows: [
        {
          path: 'scripts/invariants/screen-certification.test.mjs',
          cron: '0 9 * * *',
        },
      ],
    });
    assert.match(dropped.join('\n'), /dropped its schedule/);
  });

  it('does not require proof for excluded Ovie, auth, MenuMonitor, or iOS shell changes', () => {
    const result = evaluateChangedScreens({
      changedFiles: [
        'apps/desktop/src/ovie-door.ts',
        'apps/web/app/(auth)/sign-in/page.tsx',
        'apps/macos/MenuMonitor/Package.swift',
        'apps/ios/Jovie/Features/AppShell/AppShellView.swift',
        'apps/ios/Jovie/Features/Auth/AuthScreen.swift',
      ],
      headSha: HEAD,
      mintFromSamples: false,
      proofs: [],
    });
    assert.deepEqual(result.issues, []);
    assert.ok(result.excludedChanges.length >= 4);
  });

  it('rejects missing registration for a changed in-scope screen', () => {
    const added = 'apps/web/app/(home)/unregistered/page.tsx';
    const result = evaluateChangedScreens({
      changedFiles: [{ path: added, status: 'A' }],
      headSha: HEAD,
      mintFromSamples: false,
      proofs: [],
    });
    assert.match(result.issues.join('\n'), /missing registration/);
  });

  it('rejects stale exact-head proof', () => {
    const screen = gated()[0];
    const proof = makeScreenProof(screen, 'bbbbbbbb');
    const text = evaluateScreenProof(proof, { screen, headSha: HEAD });
    assert.match(text.join('\n'), /stale or missing exact-head proof/);
  });

  it('rejects scheduled-sweep as changed-surface proof', () => {
    const text = findings({ tier: 'scheduled-sweep' });
    assert.match(text, /scheduled-sweep cannot satisfy changed-surface proof/);
  });

  it('rejects two decisions for one viewport', () => {
    const text = findings(
      {
        viewports: [
          { id: 'desktop', decision: 'pass' },
          { id: 'desktop', decision: 'block' },
          { id: 'mobile', decision: 'pass' },
        ],
      },
      home()
    );
    assert.match(text, /more than one decision/);
  });

  it('rejects disclosure in the active flow', () => {
    const text = findings({ activeFlow: { disclosure: true } });
    assert.match(text, /disclosure must not appear in the active flow/);
  });

  it('rejects history/proof mixed into the active flow', () => {
    const text = findings({
      activeFlow: { disclosure: false, historyProof: { separate: false } },
    });
    assert.match(text, /history\/proof must be separate from the active flow/);
  });

  it('rejects proofs without visible actions', () => {
    assert.match(
      findings({ visibleActions: [] }),
      /visible actions are required/
    );
  });

  it('keeps deliberate-red fixtures blocking and binds the adopted invariant', () => {
    const result = runScreenCertification({ headSha: HEAD, changedFiles: [] });
    assert.equal(result.ok, true, result.receipt.issues.join('\n'));
    assert.equal(
      result.receipt.fixtures.length,
      DELIBERATE_RED_FIXTURES.length
    );
    assert.ok(result.receipt.fixtures.every(item => item.verdict === 'block'));
    const invariant = readInvariantRegistry().invariants.find(
      item => item.id === SCREEN_CERT_INVARIANT_ID
    );
    assert.equal(invariant?.policy?.value?.schema, SCREEN_CERT_SCHEMA);
    const source = resolve(ROOT, 'scripts/invariants/screen-certification.mjs');
    assert.match(readFileSync(source, 'utf8'), /JOV-INV-018/);
  });
});
