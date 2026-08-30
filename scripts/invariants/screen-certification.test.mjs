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
  PROTECTED_REVENUE_SCREEN_SOURCES,
  RETAINED_SWEEP_WORKFLOWS,
  runScreenCertification,
  SCREEN_CERT_INVARIANT_ID,
  SCREEN_CERT_SCHEMA,
  SCREEN_PLATFORMS,
  SCREEN_REGISTRY,
  validateProtectedRevenueScreenRegistry,
  validateRetainedSweeps,
  validateScreenRegistry,
} from './screen-certification.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const gated = () => SCREEN_REGISTRY.filter(entry => !entry.excluded);
const home = () => SCREEN_REGISTRY.find(e => e.id === 'web.homepage');
const protectedSources = () => Object.keys(PROTECTED_REVENUE_SCREEN_SOURCES);
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

  it('registers every protected revenue screen source', () => {
    assert.deepEqual(protectedSources(), [
      'apps/web/app/(dynamic)/start/page.tsx',
      'apps/web/app/app/(shell)/page.tsx',
      'apps/web/app/app/(shell)/jovie-work/page.tsx',
      'apps/web/app/app/(shell)/settings/billing/page.tsx',
      'apps/web/app/onboarding/checkout/page.tsx',
      'apps/web/app/billing/success/page.tsx',
    ]);
    for (const source of protectedSources()) {
      assert.equal(kindOf(source), 'registered', source);
    }
    assert.deepEqual(validateProtectedRevenueScreenRegistry(), []);
  });

  it('rejects duplicate protected owners and missing mobile proof', () => {
    const source = 'apps/web/app/app/(shell)/jovie-work/page.tsx';
    const screen = SCREEN_REGISTRY.find(entry =>
      entry.sources.includes(source)
    );
    const cases = [
      {
        registry: [
          ...SCREEN_REGISTRY,
          { ...screen, id: 'web.jovie-work-duplicate', owner: 'duplicate' },
        ],
        expected: /exactly one non-excluded registry owner; found 2/,
      },
      {
        registry: SCREEN_REGISTRY.map(entry =>
          entry.id === screen.id ? { ...entry, viewports: ['desktop'] } : entry
        ),
        expected: /must include mobile viewport proof/,
      },
    ];
    for (const { registry, expected } of cases) {
      assert.match(
        validateProtectedRevenueScreenRegistry(registry).join('\n'),
        expected
      );
    }
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

  it('registers the public developer guide for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/developers/page.tsx';
    const screen = SCREEN_REGISTRY.find(entry => entry.id === 'web.developers');

    assert.deepEqual(screen, {
      id: 'web.developers',
      platform: 'web',
      owner: 'developer-documentation',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'A' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      { id: 'web.developers', verdict: 'pass', findings: [] },
    ]);
  });

  it('registers the public CLI landing page for desktop and mobile certification', () => {
    const source = 'apps/web/app/(marketing)/cli/page.tsx';
    const screen = SCREEN_REGISTRY.find(entry => entry.id === 'web.cli');

    assert.deepEqual(screen, {
      id: 'web.cli',
      platform: 'web',
      owner: 'cli-landing',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'A' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      { id: 'web.cli', verdict: 'pass', findings: [] },
    ]);
  });

  it('registers the public API versioning policy for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/api-versioning/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.api-versioning-policy'
    );

    assert.deepEqual(screen, {
      id: 'web.api-versioning-policy',
      platform: 'web',
      owner: 'api-versioning-policy',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'A' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      { id: 'web.api-versioning-policy', verdict: 'pass', findings: [] },
    ]);
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

  it('rejects a modified protected source when its registration is missing', () => {
    const source = 'apps/web/app/app/(shell)/jovie-work/page.tsx';
    const registry = SCREEN_REGISTRY.filter(
      entry => !entry.sources.includes(source)
    );
    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      registry,
      headSha: HEAD,
      mintFromSamples: false,
      proofs: [],
    });
    assert.match(result.issues.join('\n'), /missing registration/);
  });

  it('allows an unrelated modified unregistered screen', () => {
    const result = evaluateChangedScreens({
      changedFiles: [
        {
          path: 'apps/web/app/(home)/unregistered/page.tsx',
          status: 'M',
        },
      ],
      headSha: HEAD,
      mintFromSamples: false,
      proofs: [],
    });
    assert.deepEqual(result.issues, []);
  });

  it('requires exact-head proof for a registered protected source', () => {
    const result = evaluateChangedScreens({
      changedFiles: [
        {
          path: 'apps/web/app/app/(shell)/jovie-work/page.tsx',
          status: 'M',
        },
      ],
      headSha: HEAD,
      mintFromSamples: false,
      proofs: [],
    });
    assert.match(result.issues.join('\n'), /missing exact-head proof/);
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
