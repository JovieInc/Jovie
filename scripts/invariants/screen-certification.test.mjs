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
  PROTECTED_REVENUE_SCREEN_SOURCES,
  RETAINED_SWEEP_WORKFLOWS,
  runScreenCertification,
  SCREEN_BROWSER_PROOF_SCHEMA,
  SCREEN_CERT_INVARIANT_ID,
  SCREEN_CERT_SCHEMA,
  SCREEN_PLATFORMS,
  SCREEN_REGISTRATION_GATE,
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
function validExternalProof(screen = gated()[0], headSha = HEAD) {
  return {
    schema: SCREEN_BROWSER_PROOF_SCHEMA,
    producer: 'external-render-runner',
    screenId: screen.id,
    headSha,
    tier: 'rendered-evidence',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123456789',
    artifactDigest: `sha256:${'b'.repeat(64)}`,
    capturedAt: '2026-09-02T06:30:00.000Z',
    viewports: screen.viewports.map(id => ({
      id,
      decision: 'pass',
      rendered: true,
      axe: { violations: 0 },
      overflow: { maxHorizontalPx: 0 },
      interaction: { passed: true },
      cls: { value: 0 },
    })),
    activeFlow: { disclosure: false },
    historyProof: { separate: true, path: 'docs/VISUAL_TESTING_POLICY.md' },
    visibleActions: ['Certify', 'Block'],
  };
}
function findings(patch, screen = gated()[0]) {
  const proof = { ...validExternalProof(screen), ...patch };
  return evaluateScreenProof(proof, { screen, headSha: HEAD }).join('\n');
}

describe('JOV-INV-018 screen-certification/v2', () => {
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
    assert.equal(
      kindOf('apps/ios/Jovie/Features/Dashboard/DashboardView.swift'),
      'registered'
    );
    assert.equal(
      kindOf(
        'apps/ios/Jovie/Features/Dashboard/PublicProfileBrowserView.swift'
      ),
      'registered'
    );
    assert.equal(
      kindOf('apps/ios/Jovie/Features/Library/LibrarySurfaceView.swift'),
      'registered'
    );
    assert.equal(kindOf('apps/web/app/(home)/page.tsx'), 'registered');
    assert.equal(kindOf('apps/web/app/error.tsx'), 'registered');
    assert.equal(kindOf('apps/web/app/global-error.tsx'), 'registered');
    assert.equal(
      kindOf('apps/web/app/app/(shell)/library/page.tsx'),
      'registered'
    );
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

  it('enforces desktop and mobile on every ordinary web registry entry', () => {
    const registry = SCREEN_REGISTRY.map(entry =>
      entry.id === 'web.developers'
        ? { ...entry, viewports: ['desktop'] }
        : entry
    );
    assert.match(
      validateScreenRegistry(registry, { verifySources: false }).join('\n'),
      /web\.developers: web screens must include mobile/
    );
  });

  it('keeps a separately named registration-only audit distinct from certification', () => {
    const result = runScreenCertification({
      headSha: HEAD,
      changedFiles: ['apps/web/app/(home)/page.tsx'],
      registrationOnly: true,
    });
    assert.equal(result.ok, true, result.receipt.issues.join('\n'));
    assert.equal(result.receipt.certified, false);
    assert.equal(result.receipt.status, 'source-registered');
    assert.equal(result.receipt.registrationOnly, true);
    assert.equal(result.receipt.gate, SCREEN_REGISTRATION_GATE);
    assert.equal(result.receipt.headSha, HEAD);
    assert.equal(result.receipt.invariant, SCREEN_CERT_INVARIANT_ID);
    assert.equal(result.receipt.schema, SCREEN_CERT_SCHEMA);
    const rows = result.receipt.changedScreens.map(i => [i.id, i.verdict]);
    assert.deepEqual(rows, [['web.homepage', 'evidence-required']]);
  });

  it('does not certify caller-authored proof before trusted artifact verification exists', () => {
    const screen = home();
    const result = runScreenCertification({
      headSha: HEAD,
      changedFiles: ['apps/web/app/(home)/page.tsx'],
      proofs: [validExternalProof(screen)],
    });
    assert.equal(result.ok, false);
    assert.equal(result.receipt.certified, false);
    assert.equal(result.receipt.status, 'blocked');
    assert.match(
      result.receipt.issues.join('\n'),
      /trusted external artifact verification is not installed/
    );
  });

  it('fails closed by default without external evidence', () => {
    const result = runScreenCertification({
      headSha: HEAD,
      changedFiles: ['apps/web/app/(home)/page.tsx'],
      proofs: [],
    });
    assert.equal(result.ok, false);
    assert.equal(result.receipt.certified, false);
    assert.match(result.receipt.issues.join('\n'), /missing exact-head proof/);
  });

  it('rejects self or missing diff bases in registration-only mode', () => {
    const self = runScreenCertification({
      diffBase: 'HEAD',
      registrationOnly: true,
    });
    assert.equal(self.ok, false);
    assert.match(
      self.receipt.issues.join('\n'),
      /diff base must resolve and differ from exact HEAD/
    );
    assert.throws(
      () =>
        runScreenCertification({
          diffBase: 'refs/heads/definitely-missing',
          registrationOnly: true,
        }),
      /diff base is not an exact commit/
    );
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
      { id: 'web.developers', verdict: 'evidence-required', findings: [] },
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
      {
        id: 'web.api-versioning-policy',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the canonical /cli landing page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/cli/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.cli-landing'
    );

    assert.deepEqual(screen, {
      id: 'web.cli-landing',
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
      { id: 'web.cli-landing', verdict: 'evidence-required', findings: [] },
    ]);
  });

  it('registers the engineering publication surface for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/engineering/';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.engineering-publication'
    );

    assert.deepEqual(screen, {
      id: 'web.engineering-publication',
      platform: 'web',
      owner: 'engineering-publication',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [
        { path: 'apps/web/app/(marketing)/engineering/page.tsx', status: 'A' },
        {
          path: 'apps/web/app/(marketing)/engineering/[slug]/page.tsx',
          status: 'A',
        },
        {
          path: 'apps/web/app/(marketing)/engineering/preview/page.tsx',
          status: 'A',
        },
        {
          path: 'apps/web/app/(marketing)/engineering/preview/[slug]/page.tsx',
          status: 'A',
        },
      ],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.engineering-publication',
        verdict: 'evidence-required',
        findings: [],
      },
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
      proofs: [],
      requireExternalEvidence: true,
    });
    assert.deepEqual(result.issues, []);
    assert.ok(result.excludedChanges.length >= 4);
  });

  it('rejects missing registration for a changed in-scope screen', () => {
    const added = 'apps/web/app/(home)/unregistered/page.tsx';
    const result = evaluateChangedScreens({
      changedFiles: [{ path: added, status: 'A' }],
      headSha: HEAD,
      proofs: [],
    });
    assert.match(result.issues.join('\n'), /missing registration/);
  });

  it('registers the root and global recovery presenters without requiring proof', () => {
    const result = evaluateChangedScreens({
      changedFiles: [
        { path: 'apps/web/app/error.tsx', status: 'M' },
        { path: 'apps/web/app/global-error.tsx', status: 'M' },
      ],
      headSha: HEAD,
      proofs: [],
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(
      result.changedScreens.map(screen => screen.id),
      ['web.root-error-boundary']
    );
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
      proofs: [],
    });
    assert.match(result.issues.join('\n'), /missing registration/);
  });

  it('rejects every modified screen-like path that is not registered or excluded', () => {
    const result = evaluateChangedScreens({
      changedFiles: [
        {
          path: 'apps/web/app/(home)/unregistered/page.tsx',
          status: 'M',
        },
      ],
      headSha: HEAD,
      proofs: [],
    });
    assert.match(result.issues.join('\n'), /missing registration/);
  });

  it('rejects unregistered visible boundary, desktop renderer, iOS screen, and deleted paths', () => {
    const paths = [
      'apps/web/app/(dynamic)/start/loading.tsx',
      'apps/web/app/billing/success/error.tsx',
      'apps/web/app/not-found.tsx',
      'apps/desktop/src/renderer/App.tsx',
      'apps/ios/Jovie/Features/New/NewScreen.swift',
      'apps/ios/Jovie/Features/Chat/ComposerWorkflowSheet.swift',
      'apps/ios/Jovie/Features/Teleprompter/TeleprompterOverlayView.swift',
    ];
    for (const path of paths) {
      assert.equal(kindOf(path), 'unregistered', path);
    }
    const deleted = evaluateChangedScreens({
      changedFiles: [{ path: 'apps/web/app/new/page.tsx', status: 'D' }],
      headSha: HEAD,
      proofs: [],
      requireExternalEvidence: true,
    });
    assert.match(deleted.issues.join('\n'), /missing registration/);
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
      proofs: [],
      requireExternalEvidence: true,
    });
    assert.match(result.issues.join('\n'), /missing exact-head proof/);
  });

  it('rejects stale exact-head proof', () => {
    const screen = gated()[0];
    const proof = validExternalProof(screen, 'b'.repeat(40));
    const text = evaluateScreenProof(proof, { screen, headSha: HEAD });
    assert.match(text.join('\n'), /stale or missing exact-head proof/);
  });

  it('rejects scheduled-sweep as changed-surface proof', () => {
    const text = findings({ tier: 'scheduled-sweep' });
    assert.match(text, /scheduled-sweep cannot satisfy changed-surface proof/);
  });

  it('requires a versioned external producer and immutable artifact identity', () => {
    assert.match(
      findings({ producer: 'screen-certification-gate' }),
      /producer must be external-render-runner/
    );
    assert.match(findings({ runUrl: 'local' }), /runUrl must be an https URL/);
    assert.match(
      findings({ capturedAt: 'next Tuesday' }),
      /capturedAt must be an ISO timestamp/
    );
    assert.match(
      findings({ artifactDigest: 'sha256:synthetic' }),
      /artifactDigest must be sha256/
    );
  });

  it('rejects duplicate, unknown, or unchanged external proofs', () => {
    const proof = validExternalProof(home());
    const duplicate = runScreenCertification({
      headSha: HEAD,
      changedFiles: ['apps/web/app/(home)/page.tsx'],
      proofs: [proof, proof],
    });
    assert.match(duplicate.receipt.issues.join('\n'), /duplicate proof/);

    const extra = runScreenCertification({
      headSha: HEAD,
      changedFiles: [],
      proofs: [proof],
    });
    assert.match(
      extra.receipt.issues.join('\n'),
      /proof supplied for unchanged or unknown screen/
    );
  });

  it('requires every viewport to pass render, axe, overflow, interaction, and CLS checks', () => {
    const screen = home();
    const baseline = validExternalProof(screen);
    /** @type {Array<[Record<string, unknown>, RegExp]>} */
    const cases = [
      [{ rendered: false }, /was not rendered/],
      [{ axe: { violations: 1 } }, /axe violations must be zero/],
      [{ overflow: { maxHorizontalPx: 2 } }, /horizontal overflow exceeds 1px/],
      [{ interaction: { passed: false } }, /interaction check did not pass/],
      [{ cls: { value: 0.0501 } }, /CLS exceeds 0.05/],
    ];
    for (const [patch, expected] of cases) {
      const proof = {
        ...baseline,
        viewports: baseline.viewports.map((viewport, index) =>
          index === 0 ? { ...viewport, ...patch } : viewport
        ),
      };
      assert.match(
        evaluateScreenProof(proof, { screen, headSha: HEAD }).join('\n'),
        expected
      );
    }
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

  it('requires mobile evidence for every non-excluded web screen', () => {
    for (const screen of gated().filter(entry => entry.platform === 'web')) {
      assert.ok(screen.viewports.includes('desktop'), screen.id);
      assert.ok(screen.viewports.includes('mobile'), screen.id);
    }
  });
});
