import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { readInvariantRegistry } from './registry.mjs';
import {
  classifyScreenPath,
  DELIBERATE_RED_FIXTURES,
  EXCLUDED_OWNERS,
  evaluateChangedScreens,
  evaluateScreenProof,
  PROTECTED_REVENUE_SCREEN_SOURCES,
  RETAINED_SWEEP_WORKFLOWS,
  resolveDiffBase,
  routeArtifactRequests,
  runScreenCertification,
  runScreenCertificationFromArtifact,
  SCREEN_BROWSER_PROOF_SCHEMA,
  SCREEN_CERT_INVARIANT_ID,
  SCREEN_CERT_SCHEMA,
  SCREEN_MARKETING_ROUTES,
  SCREEN_PLATFORMS,
  SCREEN_PROOF_ROUTES,
  SCREEN_REGISTRATION_GATE,
  SCREEN_REGISTRY,
  validateProtectedRevenueScreenRegistry,
  validateRetainedSweeps,
  validateScreenRegistry,
  verifyProofArtifact,
} from './screen-certification.mjs';
import { SCREEN_DECISION_SCHEMA } from './screen-decision-routing.mjs';
import { emitScreenProof } from './screen-proof-emit.mjs';
import {
  MARKETING_EVIDENCE_SCHEMA,
  marketingArtifactName,
  PRODUCER,
  REQUIRED_MARKETING_QUALITY_CHECKS,
  resolveTrustedScreenProof,
  screenProofArtifactName,
} from './screen-proof-resolver.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const gated = () => SCREEN_REGISTRY.filter(entry => !entry.excluded);
const home = () => SCREEN_REGISTRY.find(e => e.id === 'web.homepage');
const protectedSources = () => Object.keys(PROTECTED_REVENUE_SCREEN_SOURCES);
const kindOf = path => classifyScreenPath(path).kind;
const digestFile = path =>
  `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
const sha256 = bytes =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
// Archive fixtures use a store-only ZIP written in-process so the suite does
// not depend on a `zip` executable being provisioned on the runner.
function writeProofZip(root, names) {
  const nameBytes = name => new TextEncoder().encode(name);
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const name of names) {
    const data = readFileSync(join(root, name));
    const encoded = nameBytes(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(encoded.length, 26);
    chunks.push(local, encoded, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(encoded.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, encoded);
    offset += local.length + encoded.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(
    join(root, 'proof.zip'),
    Buffer.concat([...chunks, directory, end])
  );
}
function validExternalProof(screen = gated()[0], headSha = HEAD) {
  return {
    schema: SCREEN_BROWSER_PROOF_SCHEMA,
    producer: 'external-render-runner',
    status: 'unverified-candidate',
    certificationStatus: 'not-certified',
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
  it('keeps canonical profile settings and retained aliases under screen ownership', () => {
    for (const path of [
      'apps/web/app/app/(shell)/settings/profile/page.tsx',
      'apps/web/app/app/(shell)/settings/artist-profile/page.tsx',
      'apps/web/app/app/(shell)/tipping/page.tsx',
    ]) {
      const classified = classifyScreenPath(path);
      assert.equal(classified.kind, 'registered');
      assert.equal(classified.entry?.id, 'web.settings-artist-profile');
      assert.deepEqual(classified.entry?.viewports, ['desktop', 'mobile']);
    }
    const admin = classifyScreenPath(
      'apps/web/app/app/(shell)/settings/admin/page.tsx'
    );
    assert.equal(admin.kind, 'registered');
    assert.equal(admin.entry?.id, 'web.settings-admin-redirect');
    assert.deepEqual(admin.entry?.viewports, ['desktop', 'mobile']);
  });
  it('registers the money route and layout for both viewports', () => {
    for (const path of [
      'apps/web/app/app/money/page.tsx',
      'apps/web/app/app/money/layout.tsx',
    ]) {
      const entry = classifyScreenPath(path).entry;
      assert.equal(entry?.id, 'web.money');
      assert.deepEqual(entry?.viewports, ['desktop', 'mobile']);
    }
  });
  it('registers the admin chat playground route and layout for both viewports', () => {
    for (const path of [
      'apps/web/app/app/(shell)/admin/chat-playground/page.tsx',
      'apps/web/app/app/(shell)/admin/chat-playground/layout.tsx',
    ]) {
      const entry = classifyScreenPath(path).entry;
      assert.equal(entry?.id, 'web.admin-chat-playground');
      assert.deepEqual(entry?.viewports, ['desktop', 'mobile']);
    }
  });
  it('registers the admin share studio for both viewports', () => {
    const entry = classifyScreenPath(
      'apps/web/app/app/(shell)/admin/share-studio/page.tsx'
    ).entry;

    assert.equal(entry?.id, 'web.admin-share-studio');
    assert.equal(entry?.owner, 'admin-share-studio');
    assert.deepEqual(entry?.viewports, ['desktop', 'mobile']);
  });
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
    assert.equal(
      kindOf('apps/ios/Jovie/Features/Chat/MobileChatView.swift'),
      'registered'
    );
    assert.equal(kindOf('apps/web/app/(home)/page.tsx'), 'registered');
    assert.equal(
      kindOf('apps/web/app/(auth)/auth/native-return/page.tsx'),
      'excluded'
    );
    assert.equal(kindOf('apps/web/app/auth-return/page.tsx'), 'excluded');
    assert.equal(
      kindOf('apps/web/app/mobile-auth-return/page.tsx'),
      'excluded'
    );
    assert.equal(kindOf('apps/web/app/error.tsx'), 'registered');
    assert.equal(kindOf('apps/web/app/global-error.tsx'), 'registered');
    assert.equal(
      kindOf('apps/web/app/app/(shell)/library/page.tsx'),
      'registered'
    );
    assert.equal(
      kindOf('apps/web/app/(dynamic)/playlists/page.tsx'),
      'registered'
    );
  });

  it('registers provider-host layouts that ship with start and public profile', () => {
    assert.equal(
      kindOf('apps/web/app/(dynamic)/start/layout.tsx'),
      'registered'
    );
    assert.equal(kindOf('apps/web/app/[username]/layout.tsx'), 'registered');
    const result = evaluateChangedScreens({
      changedFiles: [
        { path: 'apps/web/app/(dynamic)/start/layout.tsx', status: 'M' },
        { path: 'apps/web/app/[username]/layout.tsx', status: 'M' },
      ],
      headSha: HEAD,
      proofs: [],
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens.map(screen => screen.id).sort(), [
      'web.public-profile',
      'web.start',
    ]);
  });

  it('registers the artist pay page when that screen changes', () => {
    const source = 'apps/web/app/[username]/pay/page.tsx';
    const screen = SCREEN_REGISTRY.find(entry => entry.id === 'web.artist-pay');

    assert.equal(kindOf(source), 'registered');
    assert.deepEqual(screen?.sources, [source]);
    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(
      result.changedScreens.map(changed => changed.id),
      ['web.artist-pay']
    );
  });

  it('registers every founder cockpit route for changed-surface certification', () => {
    const sources = [
      'apps/web/app/app/(shell)/admin/activity/page.tsx',
      'apps/web/app/app/(shell)/admin/growth/page.tsx',
      'apps/web/app/app/(shell)/admin/needs-you/page.tsx',
      'apps/web/app/app/(shell)/admin/operations/page.tsx',
      'apps/web/app/app/(shell)/admin/product/page.tsx',
    ];
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.ov-founder-cockpit'
    );

    assert.deepEqual(screen, {
      id: 'web.ov-founder-cockpit',
      platform: 'web',
      owner: 'ovie-founder-cockpit',
      sources,
      viewports: ['desktop', 'mobile'],
    });
    for (const source of sources) assert.equal(kindOf(source), 'registered');
  });

  it('registers the public artists directory for changed-surface certification', () => {
    const source = 'apps/web/app/artists/page.tsx';
    const screen = SCREEN_REGISTRY.find(entry => entry.id === 'web.artists');

    assert.deepEqual(screen, {
      id: 'web.artists',
      platform: 'web',
      owner: 'marketing-artists',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      { id: 'web.artists', verdict: 'evidence-required', findings: [] },
    ]);
  });

  it('registers the marketing support route for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/support/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-support'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-support',
      platform: 'web',
      owner: 'marketing-support',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-support',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers public SmartLink alias, release, and track pages', () => {
    const sources = [
      'apps/web/app/[username]/[...slug]/page.tsx',
      'apps/web/app/[username]/[slug]/page.tsx',
      'apps/web/app/[username]/[slug]/[trackSlug]/page.tsx',
    ];
    for (const source of sources) assert.equal(kindOf(source), 'registered');

    const result = evaluateChangedScreens({
      changedFiles: sources.map(path => ({ path, status: 'M' })),
      headSha: HEAD,
      proofs: [],
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens.map(screen => screen.id).sort(), [
      'web.smartlink-release',
      'web.smartlink-track',
    ]);
  });

  it('registers the canonical Links workspace and its legacy redirect', () => {
    const sources = [
      'apps/web/app/app/(shell)/links/page.tsx',
      'apps/web/app/app/(shell)/dashboard/links/page.tsx',
    ];
    const screen = SCREEN_REGISTRY.find(entry => entry.id === 'web.links');

    assert.deepEqual(screen, {
      id: 'web.links',
      platform: 'web',
      owner: 'links',
      sources,
      viewports: ['desktop', 'mobile'],
    });
    for (const source of sources) assert.equal(kindOf(source), 'registered');

    const result = evaluateChangedScreens({
      changedFiles: sources.map(path => ({ path, status: 'M' })),
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(
      result.changedScreens.map(changed => changed.id),
      ['web.links']
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
    for (const name of ['costs', 'features']) {
      const changedFiles = [`apps/web/app/app/(shell)/admin/${name}/page.tsx`];
      const registered = runScreenCertification({
        headSha: HEAD,
        changedFiles,
        registrationOnly: true,
      });
      assert.equal(registered.ok, true, registered.receipt.issues.join('\n'));
      assert.equal(registered.receipt.certified, false);
      assert.deepEqual(
        registered.receipt.changedScreens.map(item => [item.id, item.verdict]),
        [[`web.admin-${name}`, 'evidence-required']]
      );
      // Registration cannot stand in for authenticated, exact-head browser proof.
      const certification = runScreenCertification({
        headSha: HEAD,
        changedFiles,
      });
      assert.equal(certification.ok, false);
      assert.equal(certification.receipt.certified, false);
    }
  });

  it('rejects caller-authored proof that did not pass through the trusted resolver', () => {
    const screen = home();
    const result = runScreenCertification({
      headSha: HEAD,
      changedFiles: ['apps/web/app/(home)/page.tsx'],
      proofs: [validExternalProof(screen)],
    });
    assert.equal(result.ok, false);
    assert.equal(result.receipt.certified, false);
    assert.equal(result.receipt.status, 'external-certification-unavailable');
    assert.match(
      result.receipt.issues.join('\n'),
      /trusted external browser producer integration is unavailable/
    );
  });

  it('retains local artifact consistency checks without treating them as trust', () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), 'screen-cert-'));
    try {
      writeFileSync(join(artifactRoot, 'bundle.bin'), 'rendered-stills');
      const base = {
        artifactPath: 'bundle.bin',
        artifactDigest: digestFile(join(artifactRoot, 'bundle.bin')),
      };
      assert.equal(verifyProofArtifact(base, { artifactRoot }), null);
      assert.match(
        verifyProofArtifact(
          { ...base, artifactPath: 'absent.bin' },
          { artifactRoot }
        ),
        /artifact bytes are unreadable/
      );
      assert.match(
        verifyProofArtifact(
          { ...base, artifactDigest: `sha256:${'c'.repeat(64)}` },
          { artifactRoot }
        ),
        /artifactDigest does not match the rendered artifact bytes/
      );
      assert.match(
        verifyProofArtifact(
          { ...base, artifactPath: '../outside.bin' },
          { artifactRoot }
        ),
        /escapes the artifact root/
      );
    } finally {
      rmSync(artifactRoot, { force: true, recursive: true });
    }
  });

  it('does not certify caller-authored proof without rendered artifact bytes', () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), 'screen-cert-audit-'));
    try {
      const artifactPath = 'not-rendered.txt';
      writeFileSync(
        join(artifactRoot, artifactPath),
        'Deliberately plain text, not rendered evidence.'
      );
      const screen = home();
      const proof = {
        schema: SCREEN_BROWSER_PROOF_SCHEMA,
        producer: 'external-render-runner',
        screenId: screen.id,
        headSha: HEAD,
        tier: 'rendered-evidence',
        runUrl: 'https://example.com/unverified',
        artifactPath,
        artifactDigest: digestFile(join(artifactRoot, artifactPath)),
        capturedAt: '2099-01-01T00:00:00Z',
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
        historyProof: { separate: true },
        visibleActions: ['Certify'],
      };
      assert.equal(verifyProofArtifact(proof, { artifactRoot }), null);
      const attemptedCallerVerifier = {
        screen,
        headSha: HEAD,
        verifyArtifact: candidate =>
          verifyProofArtifact(candidate, { artifactRoot }),
      };
      const result = evaluateScreenProof(
        proof,
        /** @type {any} */ (attemptedCallerVerifier)
      );
      assert.match(result.join('\n'), /unverified-candidate/);
      assert.match(result.join('\n'), /not-certified/);
      assert.match(
        result.join('\n'),
        /trusted external browser producer integration is unavailable/
      );
    } finally {
      rmSync(artifactRoot, { force: true, recursive: true });
    }
  });

  it('certifies an exact-head screen through the owned GitHub artifact transport', () => {
    const root = mkdtempSync(join(tmpdir(), 'screen-resolver-gh-'));
    const priorPath = process.env.PATH;
    const priorDiffBase = process.env.SCREEN_CERT_DIFF_BASE;
    const priorRunId = process.env.GITHUB_RUN_ID;
    const priorRunAttempt = process.env.GITHUB_RUN_ATTEMPT;
    try {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout.trim();
      const image = readFileSync(
        join(ROOT, 'docs/screenshots/gem-symphony-hud-430x90.png')
      );
      /** @type {[string, Buffer][]} */
      const images = [
        ['screenshots/desktop.png', image],
        ['screenshots/mobile.png', image],
      ];
      const digest = createHash('sha256');
      for (const [name, bytes] of images) {
        digest.update(name);
        digest.update('\0');
        digest.update(bytes);
        digest.update('\0');
      }
      const now = Date.now();
      const iso = offset => new Date(now + offset).toISOString();
      const proof = {
        ...validExternalProof(home(), head),
        environment: 'local-production-build',
        sourcePaths: [...home().sources].sort(),
        capturedAt: iso(-60_000),
        artifactDigest: `sha256:${digest.digest('hex')}`,
        runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/77/attempts/3',
        producerRunId: 77,
        producerRunAttempt: 3,
        producerJobId: 99,
        viewports: ['desktop', 'mobile'].map(id => ({
          id,
          requestedRoute: '/',
          finalUrl: 'http://localhost:3000/',
          decision: 'pass',
          rendered: true,
          axe: { violations: 0 },
          overflow: { maxHorizontalPx: 0 },
          interaction: { passed: true },
          cls: { value: 0 },
          contrast: { passed: true },
          runtime: {
            consoleErrors: 0,
            pageErrors: 0,
            failedResponses: 0,
            failedRequests: 0,
          },
        })),
      };
      writeFileSync(join(root, 'screen-proof.json'), JSON.stringify(proof));
      for (const [name, bytes] of images) {
        mkdirSync(dirname(join(root, name)), { recursive: true });
        writeFileSync(join(root, name), bytes);
      }
      writeProofZip(root, [
        'screen-proof.json',
        ...images.map(([name]) => name),
      ]);
      const zip = readFileSync(join(root, 'proof.zip'));
      let records = {
        artifact: {
          id: 42,
          name: screenProofArtifactName('web.homepage'),
          expired: false,
          digest: sha256(zip),
          created_at: iso(-30_000),
          workflow_run: { id: 77 },
        },
        run: {
          id: 77,
          run_attempt: 3,
          repository: { full_name: 'JovieInc/Jovie' },
          head_branch: 'main',
          head_sha: head,
          path: '.github/workflows/screenshots.yml',
          event: 'push',
          conclusion: 'success',
        },
        jobs: {
          jobs: [
            {
              id: 99,
              name: 'Generate Screenshots',
              run_id: 77,
              run_attempt: 3,
              head_sha: head,
              conclusion: 'success',
              started_at: iso(-90_000),
              completed_at: iso(-10_000),
            },
          ],
        },
        changed: 'M\tapps/web/app/(home)/page.tsx\n',
      };
      const gh = join(root, 'gh');
      writeFileSync(
        gh,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:r.run));`
      );
      const git = join(root, 'git');
      writeFileSync(
        git,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const a=process.argv.slice(2),r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(a[0]==='rev-parse')process.stdout.write(a.some(v=>v.startsWith('c'.repeat(40)))?'c'.repeat(40):r.run.head_sha);else if(a[0]==='diff')process.stdout.write(r.changed);else process.exit(1);`
      );
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      chmodSync(gh, 0o755);
      chmodSync(git, 0o755);
      process.env.PATH = `${root}:${priorPath}`;
      process.env.SCREEN_CERT_DIFF_BASE = 'c'.repeat(40);
      const certify = decisionDeclarations =>
        runScreenCertificationFromArtifact({
          artifactId: 42,
          screenId: 'web.homepage',
          decisionDeclarations,
        });
      const resolveProof = () =>
        resolveTrustedScreenProof({
          artifactId: 42,
          context: {
            headSha: head,
            screenId: 'web.homepage',
            sourcePaths: home().sources,
            viewports: home().viewports,
            proofRoute: '/',
          },
        });
      const result = certify();
      assert.deepEqual([result.ok, result.receipt.certified], [true, true]);
      assert.equal(result.receipt.status, 'certified');
      const withEvent = certify({
        schema: SCREEN_DECISION_SCHEMA,
        headSha: head,
        changedPaths: ['apps/web/app/(home)/page.tsx'],
        decisions: [
          {
            id: 'permanent-identity',
            kind: 'event',
            eventClass: 'identity',
            paths: ['apps/web/app/(home)/page.tsx'],
            proposedEffect: 'Change the permanent public identity.',
            evidence: ['canon/VOICE.md'],
          },
        ],
      });
      assert.equal(withEvent.receipt.certified, true);
      assert.equal(
        withEvent.receipt.decisionRouting.status,
        'founder-routing-unavailable'
      );
      assert.equal(withEvent.receipt.decisionRouting.approvalVerified, false);
      assert.equal(withEvent.receipt.decisionRouting.deliveryVerified, false);
      assert.equal(
        result.receipt.certificationScope,
        'targeted-screen-plus-change-set'
      );
      assert.deepEqual(result.receipt.targetedScreenIds, ['web.homepage']);
      assert.deepEqual(result.receipt.changedScreens, [
        {
          id: 'web.homepage',
          verdict: 'pass',
          findings: [],
          artifactDigest: proof.artifactDigest,
          rendererRunUrl: proof.runUrl,
        },
      ]);
      assert.ok(
        resolveProof().proof,
        'fixture must exercise resolver acceptance'
      );

      records.run.status = 'in_progress';
      records.run.conclusion = null;
      process.env.GITHUB_RUN_ID = '77';
      process.env.GITHUB_RUN_ATTEMPT = '3';
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      assert.ok(
        resolveProof().proof,
        'a downstream job in the same run may verify its completed producer job'
      );
      process.env.GITHUB_RUN_ATTEMPT = '4';
      assert.equal(resolveProof().proof, null);
      process.env.GITHUB_RUN_ATTEMPT = '3';
      records.run.status = 'completed';
      records.run.conclusion = 'success';
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));

      const baselineProof = structuredClone(proof);
      const baselineRecords = structuredClone(records);
      let screenshot = image;
      const rebuild = () => {
        writeFileSync(join(root, 'screen-proof.json'), JSON.stringify(proof));
        for (const [name] of images)
          writeFileSync(join(root, name), screenshot);
        rmSync(join(root, 'proof.zip'));
        writeProofZip(root, [
          'screen-proof.json',
          ...images.map(([name]) => name),
        ]);
        records.artifact.digest = sha256(readFileSync(join(root, 'proof.zip')));
      };
      /** @param {{ mutate: () => void; archive?: boolean }} test */
      const rejects = ({ mutate, archive = false }) => {
        Object.assign(proof, structuredClone(baselineProof));
        records = structuredClone(baselineRecords);
        screenshot = image;
        mutate();
        if (archive) rebuild();
        writeFileSync(join(root, 'records.json'), JSON.stringify(records));
        assert.equal(resolveProof().proof, null);
      };
      /** @type {[boolean, () => void][]} */
      const negativeCases = [
        [false, () => (records.run.head_sha = 'b'.repeat(40))],
        [false, () => (records.run.repository.full_name = 'attacker/Jovie')],
        [false, () => (records.run.path = '.github/workflows/other.yml')],
        [false, () => (records.jobs.jobs[0].name = 'Invented producer')],
        [false, () => (records.jobs.jobs[0].run_attempt = 0)],
        [false, () => (records.artifact.created_at = iso(-9 * 60_000))],
        [false, () => (records.artifact.digest = sha256('modified artifact'))],
        [true, () => (proof.environment = 'preview')],
        [true, () => (proof.capturedAt = iso(9 * 60_000))],
        [
          true,
          () => {
            proof.producerRunId = 999;
            proof.runUrl = 'https://example.test/invented-run';
          },
        ],
        [true, () => proof.sourcePaths.push('apps/web/app/waitlist/page.tsx')],
        [
          true,
          () =>
            (proof.viewports[0].finalUrl = 'http://localhost:3000/waitlist'),
        ],
        [true, () => (proof.viewports[0].runtime.pageErrors = 1)],
        [true, () => delete proof.viewports[0].contrast],
        [true, () => (screenshot = Buffer.alloc(0))],
      ];
      for (const [archive, mutate] of negativeCases)
        rejects({ archive, mutate });
      Object.assign(proof, structuredClone(baselineProof));
      records = structuredClone(baselineRecords);
      screenshot = image;
      rebuild();
      records.changed = [
        'M\tapps/web/app/(home)/page.tsx',
        'M\tapps/web/app/waitlist/page.tsx',
      ].join('\n');
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      const widened = runScreenCertificationFromArtifact({
        artifactId: 42,
        screenId: 'web.homepage',
      });
      assert.deepEqual([widened.ok, widened.receipt.certified], [false, false]);
      assert.match(
        widened.receipt.issues.join('\n'),
        /missing exact-head proof for web\.waitlist/
      );
    } finally {
      process.env.PATH = priorPath;
      if (priorDiffBase === undefined) delete process.env.SCREEN_CERT_DIFF_BASE;
      else process.env.SCREEN_CERT_DIFF_BASE = priorDiffBase;
      if (priorRunId === undefined) delete process.env.GITHUB_RUN_ID;
      else process.env.GITHUB_RUN_ID = priorRunId;
      if (priorRunAttempt === undefined) delete process.env.GITHUB_RUN_ATTEMPT;
      else process.env.GITHUB_RUN_ATTEMPT = priorRunAttempt;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('keeps workflow producer identity synchronized with the trusted resolver', () => {
    const workflow = readFileSync(
      join(ROOT, '.github/workflows/screenshots.yml'),
      'utf8'
    );
    assert.match(workflow, new RegExp(`name: ${PRODUCER.job}`));
    assert.match(workflow, new RegExp(`name: ${PRODUCER.artifact}`));
    assert.match(workflow, new RegExp(`--environment=${PRODUCER.environment}`));
    assert.equal(SCREEN_MARKETING_ROUTES['web.homepage'], '/');
    assert.equal(SCREEN_PROOF_ROUTES['web.public-profile'], '/unfazed');
    const profileSpec = readFileSync(
      join(
        ROOT,
        'apps/web/tests/product-screenshots/public-profile-screen-proof.spec.ts'
      ),
      'utf8'
    );
    assert.match(
      profileSpec,
      new RegExp(
        `const profileRoute = '${SCREEN_PROOF_ROUTES['web.public-profile']}'`
      )
    );
  });

  it('keeps every registered marketing route binding internally consistent', () => {
    const routes = Object.entries(SCREEN_MARKETING_ROUTES);
    assert.ok(routes.length > 1, 'expected more than just web.homepage bound');
    const seenRoutes = new Set();
    for (const [screenId, route] of routes) {
      const screen = SCREEN_REGISTRY.find(entry => entry.id === screenId);
      assert.ok(screen, `${screenId} must be a registered screen`);
      assert.ok(!screen.excluded, `${screenId} must not be excluded`);
      assert.equal(
        screen.platform,
        'web',
        `${screenId} is not a web screen; marketing routes only bind web screens`
      );
      assert.match(
        route,
        /^\//,
        `${screenId} marketing route must be an absolute path`
      );
      assert.ok(
        !seenRoutes.has(route),
        `route ${route} is bound to more than one screen id`
      );
      seenRoutes.add(route);
    }
  });

  it('keeps the /artists producer identity synchronized with the trusted resolver (JOV-7125)', () => {
    const workflow = readFileSync(
      join(ROOT, '.github/workflows/screenshots.yml'),
      'utf8'
    );
    assert.equal(SCREEN_PROOF_ROUTES['web.artists'], '/artists');
    // web.public-profile keeps the original bare PRODUCER.artifact name;
    // every other SCREEN_PROOF_ROUTES-style producer gets its own dedicated
    // name so two single-screen producer artifacts never collide inside one
    // workflow run's artifact namespace.
    assert.equal(
      screenProofArtifactName('web.public-profile'),
      PRODUCER.artifact
    );
    assert.equal(
      screenProofArtifactName('web.artists'),
      `${PRODUCER.artifact}-artists`
    );
    assert.notEqual(
      screenProofArtifactName('web.artists'),
      screenProofArtifactName('web.public-profile')
    );
    assert.equal(screenProofArtifactName('malformed-no-dot'), null);
    assert.equal(screenProofArtifactName(42), null);
    assert.match(workflow, /- 'apps\/web\/app\/artists\/\*\*'/);
    assert.match(workflow, /--screen=web\.artists/);
    assert.match(
      workflow,
      new RegExp(`name: ${screenProofArtifactName('web.artists')}`)
    );
    assert.match(workflow, /--screen-id=web\.artists/);
    assert.match(
      workflow,
      /artists-artifact-id: \$\{\{ steps\.artists-proof\.outputs\.artifact-id \}\}/
    );
    const artistsSpec = readFileSync(
      join(
        ROOT,
        'apps/web/tests/product-screenshots/artists-screen-proof.spec.ts'
      ),
      'utf8'
    );
    assert.match(
      artistsSpec,
      new RegExp(`const artistsRoute = '${SCREEN_PROOF_ROUTES['web.artists']}'`)
    );
  });

  it('keeps the smartlink screen-fixture producer identity synchronized with the trusted resolver (JOV-7127)', () => {
    const workflow = readFileSync(
      join(ROOT, '.github/workflows/screenshots.yml'),
      'utf8'
    );
    assert.equal(
      SCREEN_PROOF_ROUTES['web.smartlink-release'],
      '/jovie-screen-fixture/screen-cert-release'
    );
    assert.equal(
      SCREEN_PROOF_ROUTES['web.smartlink-track'],
      '/jovie-screen-fixture/screen-cert-release/screen-cert-track'
    );
    // Every SCREEN_PROOF_ROUTES-style producer gets its own dedicated
    // artifact name so single-screen producers never collide inside one
    // workflow run's artifact namespace.
    assert.equal(
      screenProofArtifactName('web.smartlink-release'),
      `${PRODUCER.artifact}-smartlink-release`
    );
    assert.equal(
      screenProofArtifactName('web.smartlink-track'),
      `${PRODUCER.artifact}-smartlink-track`
    );
    assert.notEqual(
      screenProofArtifactName('web.smartlink-release'),
      screenProofArtifactName('web.smartlink-track')
    );

    assert.match(workflow, /--screen=web\.smartlink-release/);
    assert.match(
      workflow,
      new RegExp(`name: ${screenProofArtifactName('web.smartlink-release')}`)
    );
    assert.match(workflow, /--screen-id=web\.smartlink-release/);
    assert.match(
      workflow,
      /smartlink-release-artifact-id: \$\{\{ steps\.smartlink-release-proof\.outputs\.artifact-id \}\}/
    );

    assert.match(workflow, /--screen=web\.smartlink-track/);
    assert.match(
      workflow,
      new RegExp(`name: ${screenProofArtifactName('web.smartlink-track')}`)
    );
    assert.match(workflow, /--screen-id=web\.smartlink-track/);
    assert.match(
      workflow,
      /smartlink-track-artifact-id: \$\{\{ steps\.smartlink-track-proof\.outputs\.artifact-id \}\}/
    );

    const releaseSpec = readFileSync(
      join(
        ROOT,
        'apps/web/tests/product-screenshots/smartlink-release-screen-proof.spec.ts'
      ),
      'utf8'
    );
    assert.match(
      releaseSpec,
      new RegExp(
        `const smartlinkReleaseRoute = '${SCREEN_PROOF_ROUTES['web.smartlink-release']}'`
      )
    );

    const trackSpec = readFileSync(
      join(
        ROOT,
        'apps/web/tests/product-screenshots/smartlink-track-screen-proof.spec.ts'
      ),
      'utf8'
    );
    assert.match(
      trackSpec,
      new RegExp(
        `const smartlinkTrackRoute =\\s*\\n\\s*'${SCREEN_PROOF_ROUTES['web.smartlink-track'].replace(/\//g, '\\/')}'`
      )
    );
  });

  it('keeps the /hud isolated producer identity synchronized with the trusted resolver (JOV-7126)', () => {
    const workflow = readFileSync(
      join(ROOT, '.github/workflows/screenshots.yml'),
      'utf8'
    );
    assert.equal(SCREEN_PROOF_ROUTES['web.hud-isolated'], '/hud?fs=1');
    assert.equal(
      screenProofArtifactName('web.hud-isolated'),
      `${PRODUCER.artifact}-hud-isolated`
    );
    assert.notEqual(
      screenProofArtifactName('web.hud-isolated'),
      screenProofArtifactName('web.public-profile')
    );
    assert.notEqual(
      screenProofArtifactName('web.hud-isolated'),
      screenProofArtifactName('web.artists')
    );
    assert.match(workflow, /--screen=web\.hud-isolated/);
    assert.match(
      workflow,
      new RegExp(`name: ${screenProofArtifactName('web.hud-isolated')}`)
    );
    assert.match(workflow, /--screen-id=web\.hud-isolated/);
    assert.match(
      workflow,
      /hud-isolated-artifact-id: \$\{\{ steps\.hud-isolated-proof\.outputs\.artifact-id \}\}/
    );
    const hudSpec = readFileSync(
      join(
        ROOT,
        'apps/web/tests/product-screenshots/hud-isolated-screen-proof.spec.ts'
      ),
      'utf8'
    );
    assert.match(hudSpec, /const proofRoute = '\/hud\?fs=1'/);
  });

  it('routes changed screens to their matching artifacts in one certification pass', () => {
    const homepage = home();
    const profile = SCREEN_REGISTRY.find(
      screen => screen.id === 'web.public-profile'
    );
    assert.ok(homepage);
    assert.ok(profile);
    assert.deepEqual(
      routeArtifactRequests({
        pendingScreens: [homepage],
        requested: [{ artifactId: 42, screenId: profile.id }],
        fallbackArtifactId: 43,
      }),
      [
        { artifactId: 42, screenId: 'web.public-profile' },
        { artifactId: 43, screenId: 'web.homepage' },
      ]
    );
    assert.deepEqual(
      routeArtifactRequests({
        pendingScreens: [profile],
        requested: [{ artifactId: 42, screenId: profile.id }],
        fallbackArtifactId: 43,
      }),
      [{ artifactId: 42, screenId: 'web.public-profile' }]
    );
  });

  it('fails closed for invalid controlled artifact requests through the API and CLI', () => {
    for (const options of [
      {
        artifactId: 0,
        screenId: 'web.homepage',
        expectedScreens: ['web.homepage'],
        expectedIssue: /controlled resolver request is invalid/,
      },
      {
        artifactId: 42,
        screenId: 'web.unknown',
        expectedScreens: [],
        expectedIssue: /unknown or excluded screen web\.unknown/,
      },
    ]) {
      const result = runScreenCertificationFromArtifact({
        ...options,
        // Targeted-screen behavior is the subject of this test. Pin an empty
        // diff so unrelated branch commits cannot add more changed screens.
        diffBase: 'HEAD',
      });
      assert.equal(result.ok, false);
      assert.equal(result.receipt.certified, false);
      assert.equal(result.receipt.status, 'blocked');
      assert.deepEqual(
        result.receipt.changedScreens.map(screen => screen.id),
        options.expectedScreens
      );
      assert.match(result.receipt.issues.join('\n'), options.expectedIssue);
    }

    const root = mkdtempSync(join(tmpdir(), 'screen-certification-cli-'));
    try {
      const receiptPath = join(root, 'receipt.json');
      const result = spawnSync(
        process.execPath,
        [
          resolve(ROOT, 'scripts/invariants/screen-certification.mjs'),
          '--artifact-id=0',
          '--screen-id=web.public-profile',
          '--diff-base=HEAD',
          `--receipt-out=${receiptPath}`,
        ],
        { cwd: ROOT, encoding: 'utf8' }
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /controlled resolver request is invalid/);
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      assert.equal(receipt.status, 'blocked');
      assert.equal(receipt.certified, false);
      assert.deepEqual(
        receipt.changedScreens.map(screen => screen.id),
        ['web.public-profile']
      );
      const incompatible = spawnSync(
        process.execPath,
        [
          resolve(ROOT, 'scripts/invariants/screen-certification.mjs'),
          '--artifact-id=42',
          '--screen-id=web.public-profile',
          '--registration-only',
        ],
        { cwd: ROOT, encoding: 'utf8' }
      );
      assert.equal(incompatible.status, 1);
      assert.match(
        incompatible.stderr,
        /targeted artifact certification is incompatible/
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('resolves a genuine trusted producer artifact into an exact-build pass', () => {
    const root = mkdtempSync(join(tmpdir(), 'screen-resolver-pass-'));
    const priorPath = process.env.PATH;
    const priorDiffBase = process.env.SCREEN_CERT_DIFF_BASE;
    try {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout.trim();
      const image = readFileSync(
        join(ROOT, 'docs/screenshots/gem-symphony-hud-430x90.png')
      );
      /** @type {[string, Buffer][]} */
      const images = [
        ['screenshots/desktop.png', image],
        ['screenshots/mobile.png', image],
      ];
      const now = Date.now();
      const iso = offset => new Date(now + offset).toISOString();
      const proof = {
        schema: SCREEN_BROWSER_PROOF_SCHEMA,
        producer: 'external-render-runner',
        status: 'unverified-candidate',
        certificationStatus: 'not-certified',
        screenId: 'web.homepage',
        headSha: head,
        tier: 'rendered-evidence',
        runUrl: `https://github.com/JovieInc/Jovie/actions/runs/77/attempts/3`,
        producerRunId: 77,
        producerRunAttempt: 3,
        producerJobId: 99,
        environment: 'local-production-build',
        sourcePaths: [
          'apps/web/app/(home)/page.tsx',
          'apps/web/app/(home)/layout.tsx',
        ],
        capturedAt: iso(-60_000),
        artifactDigest: `sha256:${'0'.repeat(64)}`,
        activeFlow: { disclosure: false },
        historyProof: { separate: true, path: 'docs/VISUAL_TESTING_POLICY.md' },
        visibleActions: ['Certify', 'Block'],
        viewports: ['desktop', 'mobile'].map(id => ({
          id,
          decision: 'pass',
          rendered: true,
          axe: { violations: 0 },
          overflow: { maxHorizontalPx: 0 },
          interaction: { passed: true },
          cls: { value: 0 },
          contrast: { passed: true },
        })),
      };
      writeFileSync(join(root, 'screen-proof.json'), JSON.stringify(proof));
      for (const [name, bytes] of images) {
        mkdirSync(dirname(join(root, name)), { recursive: true });
        writeFileSync(join(root, name), bytes);
      }
      const digest = createHash('sha256');
      for (const [name, bytes] of images) {
        digest.update(name);
        digest.update('\0');
        digest.update(bytes);
        digest.update('\0');
      }
      proof.artifactDigest = `sha256:${digest.digest('hex')}`;
      writeFileSync(join(root, 'screen-proof.json'), JSON.stringify(proof));
      writeProofZip(root, [
        'screen-proof.json',
        ...images.map(([name]) => name),
      ]);
      const zip = readFileSync(join(root, 'proof.zip'));
      const records = {
        artifact: {
          id: 42,
          name: screenProofArtifactName('web.homepage'),
          expired: false,
          digest: sha256(zip),
          created_at: iso(-30_000),
          workflow_run: { id: 77 },
        },
        run: {
          id: 77,
          run_attempt: 3,
          repository: { full_name: 'JovieInc/Jovie' },
          head_branch: 'main',
          head_sha: head,
          path: '.github/workflows/screenshots.yml',
          event: 'push',
          conclusion: 'success',
        },
        jobs: {
          jobs: [
            {
              id: 99,
              name: 'Generate Screenshots',
              run_id: 77,
              run_attempt: 3,
              head_sha: head,
              conclusion: 'success',
              started_at: iso(-90_000),
              completed_at: iso(-10_000),
            },
          ],
        },
      };
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      const gh = join(root, 'gh');
      writeFileSync(
        gh,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:r.run));`
      );
      chmodSync(gh, 0o755);
      process.env.PATH = `${root}:${priorPath}`;
      process.env.SCREEN_CERT_DIFF_BASE = 'c'.repeat(40);
      const result = runScreenCertification({
        headSha: head,
        changedFiles: ['apps/web/app/(home)/page.tsx'],
        proofRequests: [{ artifactId: 42, screenId: 'web.homepage' }],
      });
      assert.equal(result.ok, true, result.receipt.issues.join('\n'));
      assert.equal(result.receipt.certified, true);
      assert.equal(result.receipt.status, 'certified');
      assert.deepEqual(result.receipt.changedScreens, [
        {
          id: 'web.homepage',
          verdict: 'pass',
          findings: [],
          artifactDigest: proof.artifactDigest,
          rendererRunUrl: proof.runUrl,
        },
      ]);
      assert.ok(
        result.receipt.changedScreens.every(
          screen => screen.verdict !== 'certified:true'
        )
      );
      assert.equal(
        JSON.stringify(result.receipt).includes('"certified":true'),
        true
      );
      // The certified bit is set exactly once, on the receipt — never as a
      // per-screen flag a JEV shadow lane could echo as a certified surface.
      assert.ok(
        !JSON.stringify(result.receipt.changedScreens).includes('certified')
      );
      // A caller-authored copy of the trusted proof object cannot certify:
      // trust is bound to the resolver-produced object identity.
      const copied = JSON.parse(JSON.stringify(proof));
      copied.screenId = 'web.homepage';
      const forged = runScreenCertification({
        headSha: head,
        changedFiles: ['apps/web/app/(home)/page.tsx'],
        proofs: [copied],
      });
      assert.equal(forged.ok, false);
      assert.equal(forged.receipt.certified, false);
      assert.match(
        forged.receipt.issues.join('\n'),
        /trusted external browser producer integration is unavailable/
      );
    } finally {
      process.env.PATH = priorPath;
      if (priorDiffBase === undefined) delete process.env.SCREEN_CERT_DIFF_BASE;
      else process.env.SCREEN_CERT_DIFF_BASE = priorDiffBase;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('resolves a genuine /artists SCREEN_PROOF_ROUTES producer artifact into an exact-build pass (JOV-7125)', () => {
    const root = mkdtempSync(join(tmpdir(), 'screen-resolver-artists-pass-'));
    const priorPath = process.env.PATH;
    const priorDiffBase = process.env.SCREEN_CERT_DIFF_BASE;
    try {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout.trim();
      const image = readFileSync(
        join(ROOT, 'docs/screenshots/gem-symphony-hud-430x90.png')
      );
      /** @type {[string, Buffer][]} */
      const images = [
        ['screenshots/desktop.png', image],
        ['screenshots/mobile.png', image],
      ];
      const now = Date.now();
      const iso = offset => new Date(now + offset).toISOString();
      const proofRoute = SCREEN_PROOF_ROUTES['web.artists'];
      const buildProof = () => ({
        schema: SCREEN_BROWSER_PROOF_SCHEMA,
        producer: 'external-render-runner',
        status: 'unverified-candidate',
        certificationStatus: 'not-certified',
        screenId: 'web.artists',
        headSha: head,
        tier: 'rendered-evidence',
        runUrl: `https://github.com/JovieInc/Jovie/actions/runs/78/attempts/2`,
        producerRunId: 78,
        producerRunAttempt: 2,
        producerJobId: 100,
        environment: 'local-production-build',
        sourcePaths: ['apps/web/app/artists/page.tsx'],
        capturedAt: iso(-60_000),
        artifactDigest: `sha256:${'0'.repeat(64)}`,
        activeFlow: { disclosure: false },
        historyProof: { separate: true, path: 'docs/VISUAL_TESTING_POLICY.md' },
        visibleActions: ['Certify', 'Block'],
        viewports: ['desktop', 'mobile'].map(id => ({
          id,
          requestedRoute: proofRoute,
          finalUrl: `http://localhost:3000${proofRoute}`,
          decision: 'pass',
          rendered: true,
          axe: { violations: 0 },
          overflow: { maxHorizontalPx: 0 },
          interaction: { passed: true },
          cls: { value: 0 },
          contrast: { passed: true },
          runtime: {
            consoleErrors: 0,
            pageErrors: 0,
            failedResponses: 0,
            failedRequests: 0,
          },
        })),
      });
      const proof = buildProof();
      const digest = createHash('sha256');
      for (const [name, bytes] of images) {
        mkdirSync(dirname(join(root, name)), { recursive: true });
        writeFileSync(join(root, name), bytes);
        digest.update(name);
        digest.update('\0');
        digest.update(bytes);
        digest.update('\0');
      }
      proof.artifactDigest = `sha256:${digest.digest('hex')}`;
      const buildArchive = () => {
        writeFileSync(join(root, 'screen-proof.json'), JSON.stringify(proof));
        rmSync(join(root, 'proof.zip'), { force: true });
        assert.equal(
          spawnSync(
            'zip',
            [
              '-q',
              'proof.zip',
              'screen-proof.json',
              ...images.map(([name]) => name),
            ],
            { cwd: root }
          ).status,
          0
        );
        return readFileSync(join(root, 'proof.zip'));
      };
      const zip = buildArchive();
      const makeRecords = artifactName => ({
        artifact: {
          id: 43,
          name: artifactName,
          expired: false,
          digest: sha256(zip),
          created_at: iso(-30_000),
          workflow_run: { id: 78 },
        },
        run: {
          id: 78,
          run_attempt: 2,
          repository: { full_name: 'JovieInc/Jovie' },
          head_branch: 'main',
          head_sha: head,
          path: '.github/workflows/screenshots.yml',
          event: 'push',
          conclusion: 'success',
        },
        jobs: {
          jobs: [
            {
              id: 100,
              name: 'Generate Screenshots',
              run_id: 78,
              run_attempt: 2,
              head_sha: head,
              conclusion: 'success',
              started_at: iso(-90_000),
              completed_at: iso(-10_000),
            },
          ],
        },
      });
      const gh = join(root, 'gh');
      writeFileSync(
        gh,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:r.run));`
      );
      chmodSync(gh, 0o755);
      process.env.PATH = `${root}:${priorPath}`;
      process.env.SCREEN_CERT_DIFF_BASE = 'c'.repeat(40);

      // The dedicated `screen-browser-proof-artists` artifact name resolves.
      writeFileSync(
        join(root, 'records.json'),
        JSON.stringify(makeRecords(screenProofArtifactName('web.artists')))
      );
      const result = runScreenCertification({
        headSha: head,
        changedFiles: ['apps/web/app/artists/page.tsx'],
        proofRequests: [{ artifactId: 43, screenId: 'web.artists' }],
      });
      assert.equal(result.ok, true, result.receipt.issues.join('\n'));
      assert.equal(result.receipt.certified, true);
      assert.deepEqual(result.receipt.changedScreens, [
        {
          id: 'web.artists',
          verdict: 'pass',
          findings: [],
          artifactDigest: proof.artifactDigest,
          rendererRunUrl: proof.runUrl,
        },
      ]);

      // The public-profile screen's legacy bare artifact name must not also
      // authenticate web.artists evidence — each SCREEN_PROOF_ROUTES-style
      // producer owns its own name.
      writeFileSync(
        join(root, 'records.json'),
        JSON.stringify(makeRecords(PRODUCER.artifact))
      );
      const wrongName = runScreenCertification({
        headSha: head,
        changedFiles: ['apps/web/app/artists/page.tsx'],
        proofRequests: [{ artifactId: 43, screenId: 'web.artists' }],
      });
      assert.equal(wrongName.ok, false);
      assert.equal(wrongName.receipt.certified, false);
      assert.match(
        wrongName.receipt.issues.join('\n'),
        /artifact run, workflow, or exact producer attempt is not trusted/
      );
    } finally {
      process.env.PATH = priorPath;
      if (priorDiffBase === undefined) delete process.env.SCREEN_CERT_DIFF_BASE;
      else process.env.SCREEN_CERT_DIFF_BASE = priorDiffBase;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('binds web.hud-isolated to its exact query-string proof route (JOV-7126)', () => {
    // web.hud-isolated is the first SCREEN_PROOF_ROUTES entry whose route
    // carries a query string (/hud?fs=1 is the only way to reach this
    // screen's registered source rather than the app-shell-wrapped
    // web.ov-hud-shell screen). This proves validLocalFinalUrl's
    // query-aware comparison actually binds the exact query, not just the
    // pathname.
    const root = mkdtempSync(join(tmpdir(), 'screen-resolver-hud-query-'));
    const priorPath = process.env.PATH;
    const screenId = 'web.hud-isolated';
    const screen = SCREEN_REGISTRY.find(entry => entry.id === screenId);
    assert.ok(screen, `${screenId} must stay registered for this test`);
    const proofRoute = SCREEN_PROOF_ROUTES[screenId];
    assert.equal(proofRoute, '/hud?fs=1');
    try {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout.trim();
      const image = readFileSync(
        join(ROOT, 'docs/screenshots/gem-symphony-hud-430x90.png')
      );
      /** @type {[string, Buffer][]} */
      const images = [
        ['screenshots/desktop.png', image],
        ['screenshots/mobile.png', image],
      ];
      const now = Date.now();
      const iso = offset => new Date(now + offset).toISOString();
      const buildProof = finalUrl => ({
        schema: SCREEN_BROWSER_PROOF_SCHEMA,
        producer: 'external-render-runner',
        status: 'unverified-candidate',
        certificationStatus: 'not-certified',
        screenId,
        headSha: head,
        tier: 'rendered-evidence',
        runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/81/attempts/1',
        producerRunId: 81,
        producerRunAttempt: 1,
        producerJobId: 101,
        environment: 'local-production-build',
        sourcePaths: [...screen.sources].sort(),
        capturedAt: iso(-60_000),
        artifactDigest: `sha256:${'0'.repeat(64)}`,
        activeFlow: { disclosure: false },
        historyProof: { separate: true, path: 'docs/VISUAL_TESTING_POLICY.md' },
        visibleActions: ['Exit fullscreen'],
        viewports: ['desktop', 'mobile'].map(id => ({
          id,
          requestedRoute: proofRoute,
          finalUrl,
          decision: 'pass',
          rendered: true,
          axe: { violations: 0 },
          overflow: { maxHorizontalPx: 0 },
          interaction: { passed: true },
          cls: { value: 0 },
          contrast: { passed: true },
          runtime: {
            consoleErrors: 0,
            pageErrors: 0,
            failedResponses: 0,
            failedRequests: 0,
          },
        })),
      });
      for (const [name, bytes] of images) {
        mkdirSync(dirname(join(root, name)), { recursive: true });
        writeFileSync(join(root, name), bytes);
      }
      const buildArchive = proof => {
        writeFileSync(join(root, 'screen-proof.json'), JSON.stringify(proof));
        rmSync(join(root, 'proof.zip'), { force: true });
        assert.equal(
          spawnSync(
            'zip',
            [
              '-q',
              'proof.zip',
              'screen-proof.json',
              ...images.map(([name]) => name),
            ],
            { cwd: root }
          ).status,
          0
        );
        return readFileSync(join(root, 'proof.zip'));
      };
      const makeRecords = zip => ({
        artifact: {
          id: 44,
          name: screenProofArtifactName(screenId),
          expired: false,
          digest: sha256(zip),
          created_at: iso(-30_000),
          workflow_run: { id: 81 },
        },
        run: {
          id: 81,
          run_attempt: 1,
          repository: { full_name: 'JovieInc/Jovie' },
          head_branch: 'main',
          head_sha: head,
          path: '.github/workflows/screenshots.yml',
          event: 'push',
          conclusion: 'success',
        },
        jobs: {
          jobs: [
            {
              id: 101,
              name: 'Generate Screenshots',
              run_id: 81,
              run_attempt: 1,
              head_sha: head,
              conclusion: 'success',
              started_at: iso(-90_000),
              completed_at: iso(-10_000),
            },
          ],
        },
      });
      const gh = join(root, 'gh');
      writeFileSync(
        gh,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:r.run));`
      );
      chmodSync(gh, 0o755);
      process.env.PATH = `${root}:${priorPath}`;
      const context = {
        headSha: head,
        screenId,
        sourcePaths: [...screen.sources],
        viewports: ['desktop', 'mobile'],
        proofRoute,
      };

      // 1. The exact query (?fs=1) resolves.
      const exactProof = buildProof('http://localhost:3000/hud?fs=1');
      const digest1 = createHash('sha256');
      for (const [name, bytes] of images) {
        digest1.update(name);
        digest1.update('\0');
        digest1.update(bytes);
        digest1.update('\0');
      }
      exactProof.artifactDigest = `sha256:${digest1.digest('hex')}`;
      const zip1 = buildArchive(exactProof);
      writeFileSync(
        join(root, 'records.json'),
        JSON.stringify(makeRecords(zip1))
      );
      const resolved = resolveTrustedScreenProof({ artifactId: 44, context });
      assert.deepEqual(resolved.findings, []);
      assert.equal(resolved.proof?.screenId, screenId);

      // 2. The bare path with no query (what plain /hud would report) is
      // rejected — the shell-wrapped screen's URL must not satisfy the
      // isolated screen's proof.
      const wrongQueryProof = buildProof('http://localhost:3000/hud');
      wrongQueryProof.artifactDigest = exactProof.artifactDigest;
      const zip2 = buildArchive(wrongQueryProof);
      writeFileSync(
        join(root, 'records.json'),
        JSON.stringify(makeRecords(zip2))
      );
      const rejected = resolveTrustedScreenProof({ artifactId: 44, context });
      assert.equal(rejected.proof, null);
      assert.match(
        rejected.findings.join('\n'),
        /required browser measurements are unavailable/
      );
    } finally {
      process.env.PATH = priorPath;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('fails resolver requests with specific reasons: forged, stale, wrong-build, incomplete, unavailable', () => {
    const root = mkdtempSync(join(tmpdir(), 'screen-resolver-fail-'));
    const priorPath = process.env.PATH;
    const priorDiffBase = process.env.SCREEN_CERT_DIFF_BASE;
    try {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout.trim();
      const image = readFileSync(
        join(ROOT, 'docs/screenshots/gem-symphony-hud-430x90.png')
      );
      const now = Date.now();
      const iso = offset => new Date(now + offset).toISOString();
      const baseProof = {
        schema: SCREEN_BROWSER_PROOF_SCHEMA,
        producer: 'external-render-runner',
        status: 'unverified-candidate',
        certificationStatus: 'not-certified',
        screenId: 'web.homepage',
        headSha: head,
        tier: 'rendered-evidence',
        runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/77/attempts/3',
        producerRunId: 77,
        producerRunAttempt: 3,
        producerJobId: 99,
        environment: 'local-production-build',
        sourcePaths: [
          'apps/web/app/(home)/page.tsx',
          'apps/web/app/(home)/layout.tsx',
        ],
        capturedAt: iso(-60_000),
        artifactDigest: `sha256:${'0'.repeat(64)}`,
        activeFlow: { disclosure: false },
        historyProof: { separate: true, path: 'docs/VISUAL_TESTING_POLICY.md' },
        visibleActions: ['Certify', 'Block'],
        viewports: ['desktop', 'mobile'].map(id => ({
          id,
          decision: 'pass',
          rendered: true,
          axe: { violations: 0 },
          overflow: { maxHorizontalPx: 0 },
          interaction: { passed: true },
          cls: { value: 0 },
          contrast: { passed: true },
        })),
      };
      /** @type {[string, Buffer][]} */
      const images = [
        ['screenshots/desktop.png', image],
        ['screenshots/mobile.png', image],
      ];
      for (const [name, bytes] of images) {
        mkdirSync(dirname(join(root, name)), { recursive: true });
        writeFileSync(join(root, name), bytes);
      }
      // The genuine bundle digest, so each mutated archive fails at its own
      // specific finding instead of the generic identity check.
      const bundleDigestOf = list => {
        const hash = createHash('sha256');
        for (const [name, bytes] of list) {
          hash.update(name);
          hash.update('\0');
          hash.update(bytes);
          hash.update('\0');
        }
        return `sha256:${hash.digest('hex')}`;
      };
      baseProof.artifactDigest = bundleDigestOf(images);
      const buildArchive = proof => {
        writeFileSync(join(root, 'screen-proof.json'), JSON.stringify(proof));
        rmSync(join(root, 'proof.zip'), { force: true });
        writeProofZip(root, [
          'screen-proof.json',
          ...images.map(([name]) => name),
        ]);
        return readFileSync(join(root, 'proof.zip'));
      };
      const ghScript = [
        'gh',
        `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:r.run));`,
      ];
      const [ghName, ghBody] = ghScript;
      writeFileSync(join(root, ghName), ghBody);
      chmodSync(join(root, ghName), 0o755);
      const makeRecords = patch => {
        const records = {
          artifact: {
            id: 42,
            name: screenProofArtifactName('web.homepage'),
            expired: false,
            digest: `sha256:${'0'.repeat(64)}`,
            created_at: iso(-30_000),
            workflow_run: { id: 77 },
          },
          run: {
            id: 77,
            run_attempt: 3,
            repository: { full_name: 'JovieInc/Jovie' },
            head_branch: 'main',
            head_sha: head,
            path: '.github/workflows/screenshots.yml',
            event: 'push',
            conclusion: 'success',
          },
          jobs: {
            jobs: [
              {
                id: 99,
                name: 'Generate Screenshots',
                run_id: 77,
                run_attempt: 3,
                head_sha: head,
                conclusion: 'success',
                started_at: iso(-90_000),
                completed_at: iso(-10_000),
              },
            ],
          },
        };
        for (const [key, value] of Object.entries(patch ?? {})) {
          records[key] =
            value && typeof value === 'object' && !Array.isArray(value)
              ? { ...records[key], ...value }
              : value;
        }
        writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      };
      process.env.PATH = `${root}:${priorPath}`;
      process.env.SCREEN_CERT_DIFF_BASE = 'c'.repeat(40);
      const request = () =>
        runScreenCertification({
          headSha: head,
          changedFiles: ['apps/web/app/(home)/page.tsx'],
          proofRequests: [{ artifactId: 42, screenId: 'web.homepage' }],
        });
      const issues = () => {
        const result = request();
        assert.equal(result.ok, false);
        assert.equal(result.receipt.certified, false);
        return result.receipt.issues.join('\n');
      };

      // forged: proof JSON edited after archiving — the bundle digest no
      // longer matches GitHub's artifact digest.
      const forgedProof = {
        ...structuredClone(baseProof),
        screenId: 'web.developers',
      };
      const forgedZip = buildArchive(forgedProof);
      makeRecords({ artifact: { digest: sha256(forgedZip) } });
      // The zip is intact and matches, but the proof inside claims a
      // different screen than the admission context, so the resolver's
      // identity check must reject it before any certification.
      assert.match(issues(), /candidate identity, capture, or decoded bundle/);

      // stale: the artifact was produced for an older head.
      makeRecords({
        run: { head_sha: 'b'.repeat(40) },
      });
      assert.match(
        issues(),
        /artifact run, workflow, or exact producer attempt/
      );

      // wrong-build: capture claims a non-production environment.
      makeRecords({});
      const wrongBuild = {
        ...structuredClone(baseProof),
        environment: 'preview',
      };
      buildArchive(wrongBuild);
      const wrongBuildRecords = JSON.parse(
        readFileSync(join(root, 'records.json'), 'utf8')
      );
      wrongBuildRecords.artifact.digest = sha256(
        readFileSync(join(root, 'proof.zip'))
      );
      writeFileSync(
        join(root, 'records.json'),
        JSON.stringify(wrongBuildRecords)
      );
      assert.match(issues(), /candidate identity, capture, or decoded bundle/);

      // incomplete: a required viewport measurement is missing.
      const incomplete = structuredClone(baseProof);
      delete incomplete.viewports[1];
      buildArchive(incomplete);
      const incompleteRecords = JSON.parse(
        readFileSync(join(root, 'records.json'), 'utf8')
      );
      incompleteRecords.artifact.digest = sha256(
        readFileSync(join(root, 'proof.zip'))
      );
      writeFileSync(
        join(root, 'records.json'),
        JSON.stringify(incompleteRecords)
      );
      assert.match(issues(), /required browser measurements are unavailable/);

      // unavailable: the controlled producer transport cannot be reached.
      const priorPathOnly = process.env.PATH;
      process.env.PATH = priorPathOnly
        .split(':')
        .filter(entry => entry !== root)
        .join(':');
      try {
        assert.match(
          issues(),
          /controlled GitHub artifact resolver is unavailable/
        );
      } finally {
        process.env.PATH = priorPathOnly;
      }
    } finally {
      process.env.PATH = priorPath;
      if (priorDiffBase === undefined) delete process.env.SCREEN_CERT_DIFF_BASE;
      else process.env.SCREEN_CERT_DIFF_BASE = priorDiffBase;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('resolves genuine marketing-route capture evidence into an exact-build pass', () => {
    const root = mkdtempSync(join(tmpdir(), 'screen-marketing-pass-'));
    const priorPath = process.env.PATH;
    const priorDiffBase = process.env.SCREEN_CERT_DIFF_BASE;
    const priorArtifact = process.env.SCREEN_CERT_ARTIFACT_ID;
    try {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout.trim();
      const image = readFileSync(
        join(ROOT, 'docs/screenshots/gem-symphony-hud-430x90.png')
      );
      const now = Date.now();
      const iso = offset => new Date(now + offset).toISOString();
      const receiptFor = viewport => ({
        schemaVersion: MARKETING_EVIDENCE_SCHEMA,
        buildMode: 'production',
        capturedAt: iso(-60_000),
        coverageId: `web-marketing-route-home-${viewport}`,
        documentStatus: 200,
        finalPath: '/',
        route: '/',
        fixturePath: '/',
        qualityChecks: [...REQUIRED_MARKETING_QUALITY_CHECKS],
        routeDisposition: 'active-verified',
        screenshotSha256: createHash('sha256').update(image).digest('hex'),
        sourcePath: 'apps/web/app/(home)/page.tsx',
        sourceGitSha: head,
        stateMatrix: ['anonymous-default'],
        viewport,
      });
      for (const viewport of ['desktop', 'mobile']) {
        const dir = join(root, `home-${viewport}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, 'receipt.json'),
          JSON.stringify(receiptFor(viewport))
        );
        writeFileSync(join(dir, 'marketing-route.png'), image);
      }
      writeProofZip(root, [
        'home-desktop/receipt.json',
        'home-desktop/marketing-route.png',
        'home-mobile/receipt.json',
        'home-mobile/marketing-route.png',
      ]);
      const zip = readFileSync(join(root, 'proof.zip'));
      const records = {
        artifact: {
          id: 42,
          name: marketingArtifactName(head),
          expired: false,
          digest: sha256(zip),
          created_at: iso(-30_000),
          workflow_run: { id: 77 },
        },
        run: {
          id: 77,
          run_attempt: 3,
          repository: { full_name: 'JovieInc/Jovie' },
          head_branch: 'main',
          head_sha: head,
          path: '.github/workflows/screenshots.yml',
          event: 'push',
          conclusion: 'success',
        },
        jobs: {
          jobs: [
            {
              id: 99,
              name: 'Generate Screenshots',
              run_id: 77,
              run_attempt: 3,
              head_sha: head,
              conclusion: 'success',
              started_at: iso(-90_000),
              completed_at: iso(-10_000),
            },
          ],
        },
      };
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      const gh = join(root, 'gh');
      writeFileSync(
        gh,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:r.run));`
      );
      chmodSync(gh, 0o755);
      process.env.PATH = `${root}:${priorPath}`;
      process.env.SCREEN_CERT_DIFF_BASE = 'c'.repeat(40);
      process.env.SCREEN_CERT_ARTIFACT_ID = '42';
      const result = runScreenCertification({
        headSha: head,
        changedFiles: ['apps/web/app/(home)/page.tsx'],
        artifactId: 42,
      });
      assert.equal(result.ok, true, result.receipt.issues.join('\n'));
      assert.equal(result.receipt.certified, true);
      assert.equal(result.receipt.status, 'certified');
      assert.equal(result.receipt.changedScreens[0]?.id, 'web.homepage');
      assert.equal(result.receipt.changedScreens[0]?.verdict, 'pass');
      assert.ok(
        result.receipt.changedScreens.every(
          screen => screen.verdict !== 'certified:true'
        )
      );
      assert.ok(
        !JSON.stringify(result.receipt.changedScreens).includes('certified')
      );
      const resolved = resolveTrustedScreenProof({
        artifactId: 42,
        context: {
          headSha: head,
          screenId: 'web.homepage',
          sourcePaths: [
            'apps/web/app/(home)/page.tsx',
            'apps/web/app/(home)/layout.tsx',
          ],
          viewports: home().viewports,
          marketingRoute: '/',
        },
      });
      assert.equal(resolved.proof?.certificationStatus, 'not-certified');
      assert.equal(resolved.proof?.environment, 'local-production-build');
    } finally {
      process.env.PATH = priorPath;
      if (priorDiffBase === undefined) delete process.env.SCREEN_CERT_DIFF_BASE;
      else process.env.SCREEN_CERT_DIFF_BASE = priorDiffBase;
      if (priorArtifact === undefined)
        delete process.env.SCREEN_CERT_ARTIFACT_ID;
      else process.env.SCREEN_CERT_ARTIFACT_ID = priorArtifact;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('resolves a marketing artifact past the old 32MB download cap (JOV-INV-018 2026-09-28)', () => {
    // Regression for the incident where `screenshots.yml` "Certify Screenshots"
    // failed every screen routed through the marketing artifact fallback with
    // the generic "controlled GitHub artifact resolver is unavailable" finding.
    // Root cause: the resolver's `gh api .../zip` download used a 32MB
    // spawnSync `maxBuffer`, and the real marketing artifact (60 routes x two
    // viewports of full-page PNGs) had grown to ~163MB. spawnSync silently
    // kills the child and returns a null exit status once stdout exceeds
    // maxBuffer, which `run()` turned into a thrown, unspecific error. Pad this
    // fixture's bundle with an unrelated, unmatched route pair past the old
    // 32MB ceiling to prove the download transport itself is no longer the
    // limiting factor; extraction's own MAX_EXTRACTED_ARTIFACT_BYTES ceiling
    // remains the authoritative zip-bomb guard.
    const root = mkdtempSync(join(tmpdir(), 'screen-marketing-large-'));
    const priorPath = process.env.PATH;
    const priorDiffBase = process.env.SCREEN_CERT_DIFF_BASE;
    const priorArtifact = process.env.SCREEN_CERT_ARTIFACT_ID;
    try {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout.trim();
      const image = readFileSync(
        join(ROOT, 'docs/screenshots/gem-symphony-hud-430x90.png')
      );
      const now = Date.now();
      const iso = offset => new Date(now + offset).toISOString();
      const receiptFor = viewport => ({
        schemaVersion: MARKETING_EVIDENCE_SCHEMA,
        buildMode: 'production',
        capturedAt: iso(-60_000),
        coverageId: `web-marketing-route-home-${viewport}`,
        documentStatus: 200,
        finalPath: '/',
        route: '/',
        fixturePath: '/',
        qualityChecks: [...REQUIRED_MARKETING_QUALITY_CHECKS],
        routeDisposition: 'active-verified',
        screenshotSha256: createHash('sha256').update(image).digest('hex'),
        sourcePath: 'apps/web/app/(home)/page.tsx',
        sourceGitSha: head,
        stateMatrix: ['anonymous-default'],
        viewport,
      });
      for (const viewport of ['desktop', 'mobile']) {
        const dir = join(root, `home-${viewport}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, 'receipt.json'),
          JSON.stringify(receiptFor(viewport))
        );
        writeFileSync(join(dir, 'marketing-route.png'), image);
      }
      // An unrelated route's evidence pair, padded well past the old 32MB
      // spawnSync cap. Its sourcePath deliberately does not match
      // web.homepage's registered sources, so decodeMarketingProof's
      // sourceMatches check skips it entirely — its bytes never need to be a
      // valid screenshot. Only its size, which the transport must tolerate,
      // matters here.
      const fillerDir = join(root, 'other-route-desktop');
      mkdirSync(fillerDir, { recursive: true });
      writeFileSync(
        join(fillerDir, 'receipt.json'),
        JSON.stringify({
          schemaVersion: MARKETING_EVIDENCE_SCHEMA,
          sourcePath: 'apps/web/app/(marketing)/unrelated-filler/page.tsx',
        })
      );
      const fillerBytes = Buffer.alloc(40 * 1024 * 1024, 0x42);
      writeFileSync(join(fillerDir, 'marketing-route.png'), fillerBytes);
      writeProofZip(root, [
        'home-desktop/receipt.json',
        'home-desktop/marketing-route.png',
        'home-mobile/receipt.json',
        'home-mobile/marketing-route.png',
        'other-route-desktop/receipt.json',
        'other-route-desktop/marketing-route.png',
      ]);
      const zip = readFileSync(join(root, 'proof.zip'));
      assert.ok(
        zip.length > 32 * 1024 * 1024,
        `fixture archive must exceed the old 32MB cap to reproduce the incident (got ${zip.length} bytes)`
      );
      const records = {
        artifact: {
          id: 42,
          name: marketingArtifactName(head),
          expired: false,
          digest: sha256(zip),
          created_at: iso(-30_000),
          workflow_run: { id: 77 },
        },
        run: {
          id: 77,
          run_attempt: 3,
          repository: { full_name: 'JovieInc/Jovie' },
          head_branch: 'main',
          head_sha: head,
          path: '.github/workflows/screenshots.yml',
          event: 'push',
          conclusion: 'success',
        },
        jobs: {
          jobs: [
            {
              id: 99,
              name: 'Generate Screenshots',
              run_id: 77,
              run_attempt: 3,
              head_sha: head,
              conclusion: 'success',
              started_at: iso(-90_000),
              completed_at: iso(-10_000),
            },
          ],
        },
      };
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      const gh = join(root, 'gh');
      writeFileSync(
        gh,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:r.run));`
      );
      chmodSync(gh, 0o755);
      process.env.PATH = `${root}:${priorPath}`;
      process.env.SCREEN_CERT_DIFF_BASE = 'c'.repeat(40);
      process.env.SCREEN_CERT_ARTIFACT_ID = '42';
      const result = runScreenCertification({
        headSha: head,
        changedFiles: ['apps/web/app/(home)/page.tsx'],
        artifactId: 42,
      });
      assert.equal(result.ok, true, result.receipt.issues.join('\n'));
      assert.equal(result.receipt.certified, true);
      assert.equal(result.receipt.changedScreens[0]?.id, 'web.homepage');
      assert.equal(result.receipt.changedScreens[0]?.verdict, 'pass');
    } finally {
      process.env.PATH = priorPath;
      if (priorDiffBase === undefined) delete process.env.SCREEN_CERT_DIFF_BASE;
      else process.env.SCREEN_CERT_DIFF_BASE = priorDiffBase;
      if (priorArtifact === undefined)
        delete process.env.SCREEN_CERT_ARTIFACT_ID;
      else process.env.SCREEN_CERT_ARTIFACT_ID = priorArtifact;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('classifies every JOV-7110 registry-gap source at its registered screen id', () => {
    const cases = [
      ['apps/web/app/artists/page.tsx', 'web.artists'],
      [
        'apps/web/app/(marketing)/artist-profiles/page.tsx',
        'web.artist-profiles',
      ],
      [
        'apps/web/app/(marketing)/artist-profiles/artist-profile-modes.ts',
        'web.artist-profiles',
      ],
      [
        'apps/web/app/(marketing)/artist-profile/page.tsx',
        'web.artist-profile',
      ],
      [
        'apps/web/app/(marketing)/artist-notifications/page.tsx',
        'web.artist-notifications',
      ],
      ['apps/web/app/(marketing)/voice/page.tsx', 'web.voice'],
      ['apps/web/app/(marketing)/instant-merch/page.tsx', 'web.instant-merch'],
      [
        'apps/web/app/(marketing)/instant-merch/InstantMerchLanding.tsx',
        'web.instant-merch',
      ],
      [
        'apps/web/app/(marketing)/youtube-thumbnails/page.tsx',
        'web.youtube-thumbnails',
      ],
      [
        'apps/web/app/(marketing)/youtube-thumbnails/YoutubeThumbnailsLanding.tsx',
        'web.youtube-thumbnails',
      ],
      ['apps/web/app/(marketing)/demo/video/page.tsx', 'web.demo-video'],
      ['apps/web/app/(marketing)/demovideo/page.tsx', 'web.demovideo'],
      ['apps/web/app/waitlist/invite/page.tsx', 'web.waitlist-invite'],
    ];
    for (const [path, expectedId] of cases) {
      const classified = classifyScreenPath(path);
      assert.equal(
        classified.kind,
        'registered',
        `${path} should classify as registered`
      );
      assert.equal(
        classified.entry?.id,
        expectedId,
        `${path} should register to ${expectedId}`
      );
    }
  });

  it('leaves web.artists unbound from the marketing manifest (out of manifest scope)', () => {
    // web.artists (apps/web/app/artists/page.tsx) sits outside the
    // (home)/(marketing)/(profile-admission)/waitlist roots that
    // MARKETING_ROUTE_MANIFEST covers, and
    // tests/contracts/global-page-contract.test.ts asserts the manifest's
    // glob list matches exactly what its filesystem scan of those roots
    // finds. Binding web.artists to a manifest route (even an exempt one)
    // breaks that completeness contract, so this screen needs its own
    // SCREEN_PROOF_ROUTES-style producer (JOV-7110 follow-up) rather than
    // SCREEN_MARKETING_ROUTES.
    assert.equal(SCREEN_MARKETING_ROUTES['web.artists'], undefined);
  });

  it('keeps every JOV-7110 registry-gap screen bound to the manifest route it is already captured at', () => {
    const cases = [
      ['web.voice', '/voice', 'apps/web/app/(marketing)/voice/page.tsx'],
      [
        'web.instant-merch',
        '/instant-merch',
        'apps/web/app/(marketing)/instant-merch/page.tsx',
      ],
    ];
    for (const [screenId, route, sourcePath] of cases) {
      const root = mkdtempSync(join(tmpdir(), 'screen-registry-gap-'));
      const priorPath = process.env.PATH;
      const priorDiffBase = process.env.SCREEN_CERT_DIFF_BASE;
      const priorArtifact = process.env.SCREEN_CERT_ARTIFACT_ID;
      try {
        const head = spawnSync('git', ['rev-parse', 'HEAD'], {
          cwd: ROOT,
          encoding: 'utf8',
        }).stdout.trim();
        const image = readFileSync(
          join(ROOT, 'docs/screenshots/gem-symphony-hud-430x90.png')
        );
        const now = Date.now();
        const iso = offset => new Date(now + offset).toISOString();
        const receiptFor = viewport => ({
          schemaVersion: MARKETING_EVIDENCE_SCHEMA,
          buildMode: 'production',
          capturedAt: iso(-60_000),
          coverageId: `web-marketing-route-${screenId}-${viewport}`,
          documentStatus: 200,
          finalPath: route,
          route,
          fixturePath: route,
          qualityChecks: [...REQUIRED_MARKETING_QUALITY_CHECKS],
          routeDisposition: 'active-verified',
          screenshotSha256: createHash('sha256').update(image).digest('hex'),
          sourcePath,
          sourceGitSha: head,
          stateMatrix: ['anonymous-default'],
          viewport,
        });
        for (const viewport of ['desktop', 'mobile']) {
          const dir = join(root, `screen-${viewport}`);
          mkdirSync(dir, { recursive: true });
          writeFileSync(
            join(dir, 'receipt.json'),
            JSON.stringify(receiptFor(viewport))
          );
          writeFileSync(join(dir, 'marketing-route.png'), image);
        }
        writeProofZip(root, [
          'screen-desktop/receipt.json',
          'screen-desktop/marketing-route.png',
          'screen-mobile/receipt.json',
          'screen-mobile/marketing-route.png',
        ]);
        const zip = readFileSync(join(root, 'proof.zip'));
        const records = {
          artifact: {
            id: 42,
            name: marketingArtifactName(head),
            expired: false,
            digest: sha256(zip),
            created_at: iso(-30_000),
            workflow_run: { id: 77 },
          },
          run: {
            id: 77,
            run_attempt: 3,
            repository: { full_name: 'JovieInc/Jovie' },
            head_branch: 'main',
            head_sha: head,
            path: '.github/workflows/screenshots.yml',
            event: 'push',
            conclusion: 'success',
          },
          jobs: {
            jobs: [
              {
                id: 99,
                name: 'Generate Screenshots',
                run_id: 77,
                run_attempt: 3,
                head_sha: head,
                conclusion: 'success',
                started_at: iso(-90_000),
                completed_at: iso(-10_000),
              },
            ],
          },
        };
        writeFileSync(join(root, 'records.json'), JSON.stringify(records));
        const gh = join(root, 'gh');
        writeFileSync(
          gh,
          `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:r.run));`
        );
        chmodSync(gh, 0o755);
        process.env.PATH = `${root}:${priorPath}`;
        process.env.SCREEN_CERT_DIFF_BASE = 'c'.repeat(40);
        process.env.SCREEN_CERT_ARTIFACT_ID = '42';
        const result = runScreenCertification({
          headSha: head,
          changedFiles: [sourcePath],
          artifactId: 42,
        });
        assert.equal(
          result.ok,
          true,
          `${screenId}: ${result.receipt.issues.join('\n')}`
        );
        assert.equal(result.receipt.certified, true);
        assert.equal(result.receipt.changedScreens[0]?.id, screenId);
        assert.equal(result.receipt.changedScreens[0]?.verdict, 'pass');
      } finally {
        process.env.PATH = priorPath;
        if (priorDiffBase === undefined)
          delete process.env.SCREEN_CERT_DIFF_BASE;
        else process.env.SCREEN_CERT_DIFF_BASE = priorDiffBase;
        if (priorArtifact === undefined)
          delete process.env.SCREEN_CERT_ARTIFACT_ID;
        else process.env.SCREEN_CERT_ARTIFACT_ID = priorArtifact;
        rmSync(root, { force: true, recursive: true });
      }
    }
  });

  it('fails marketing capture evidence with specific reasons: forged, stale, wrong-build, incomplete, unavailable', () => {
    const root = mkdtempSync(join(tmpdir(), 'screen-marketing-fail-'));
    const priorPath = process.env.PATH;
    const priorDiffBase = process.env.SCREEN_CERT_DIFF_BASE;
    try {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout.trim();
      const image = readFileSync(
        join(ROOT, 'docs/screenshots/gem-symphony-hud-430x90.png')
      );
      const now = Date.now();
      const iso = offset => new Date(now + offset).toISOString();
      const receiptFor = (viewport, patch = {}) => ({
        schemaVersion: MARKETING_EVIDENCE_SCHEMA,
        buildMode: 'production',
        capturedAt: iso(-60_000),
        coverageId: `web-marketing-route-home-${viewport}`,
        documentStatus: 200,
        finalPath: '/',
        route: '/',
        fixturePath: '/',
        qualityChecks: [...REQUIRED_MARKETING_QUALITY_CHECKS],
        routeDisposition: 'active-verified',
        screenshotSha256: createHash('sha256').update(image).digest('hex'),
        sourcePath: 'apps/web/app/(home)/page.tsx',
        sourceGitSha: head,
        stateMatrix: ['anonymous-default'],
        viewport,
        ...patch,
      });
      const writeBundle = receipts => {
        for (const viewport of ['desktop', 'mobile']) {
          const dir = join(root, `home-${viewport}`);
          mkdirSync(dir, { recursive: true });
          writeFileSync(
            join(dir, 'receipt.json'),
            JSON.stringify(receipts[viewport])
          );
          writeFileSync(join(dir, 'marketing-route.png'), image);
        }
        rmSync(join(root, 'proof.zip'), { force: true });
        writeProofZip(root, [
          'home-desktop/receipt.json',
          'home-desktop/marketing-route.png',
          'home-mobile/receipt.json',
          'home-mobile/marketing-route.png',
        ]);
        return readFileSync(join(root, 'proof.zip'));
      };
      const baselineReceipts = {
        desktop: receiptFor('desktop'),
        mobile: receiptFor('mobile'),
      };
      const zip = writeBundle(baselineReceipts);
      const makeRecords = patch => {
        const records = {
          artifact: {
            id: 42,
            name: marketingArtifactName(head),
            expired: false,
            digest: sha256(zip),
            created_at: iso(-30_000),
            workflow_run: { id: 77 },
          },
          run: {
            id: 77,
            run_attempt: 3,
            repository: { full_name: 'JovieInc/Jovie' },
            head_branch: 'main',
            head_sha: head,
            path: '.github/workflows/screenshots.yml',
            event: 'push',
            conclusion: 'success',
          },
          jobs: {
            jobs: [
              {
                id: 99,
                name: 'Generate Screenshots',
                run_id: 77,
                run_attempt: 3,
                head_sha: head,
                conclusion: 'success',
                started_at: iso(-90_000),
                completed_at: iso(-10_000),
              },
            ],
          },
        };
        for (const [key, value] of Object.entries(patch ?? {})) {
          records[key] =
            value && typeof value === 'object' && !Array.isArray(value)
              ? { ...records[key], ...value }
              : value;
        }
        writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      };
      const gh = join(root, 'gh');
      writeFileSync(
        gh,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:r.run));`
      );
      chmodSync(gh, 0o755);
      process.env.PATH = `${root}:${priorPath}`;
      process.env.SCREEN_CERT_DIFF_BASE = 'c'.repeat(40);
      const issues = () => {
        const result = runScreenCertification({
          headSha: head,
          changedFiles: ['apps/web/app/(home)/page.tsx'],
          artifactId: 42,
        });
        assert.equal(result.ok, false);
        assert.equal(result.receipt.certified, false);
        return result.receipt.issues.join('\n');
      };

      const forgedZip = writeBundle({
        desktop: receiptFor('desktop', {
          screenshotSha256: '0'.repeat(64),
        }),
        mobile: receiptFor('mobile'),
      });
      makeRecords({ artifact: { digest: sha256(forgedZip) } });
      assert.match(issues(), /forged marketing receipt or screenshot digest/);

      writeBundle(baselineReceipts);
      makeRecords({
        artifact: { digest: sha256(readFileSync(join(root, 'proof.zip'))) },
        run: { head_sha: 'b'.repeat(40) },
      });
      assert.match(
        issues(),
        /artifact run, workflow, or exact producer attempt/
      );

      const wrongBuildZip = writeBundle({
        desktop: receiptFor('desktop', { buildMode: 'preview' }),
        mobile: receiptFor('mobile', { buildMode: 'preview' }),
      });
      makeRecords({ artifact: { digest: sha256(wrongBuildZip) } });
      assert.match(issues(), /not an exact production build/);

      const incompleteZip = writeBundle({
        desktop: receiptFor('desktop', {
          qualityChecks: REQUIRED_MARKETING_QUALITY_CHECKS.filter(
            check => check !== 'accessibility'
          ),
        }),
        mobile: receiptFor('mobile'),
      });
      makeRecords({ artifact: { digest: sha256(incompleteZip) } });
      assert.match(
        issues(),
        /required marketing route receipts or measurements are incomplete/
      );

      for (const field of ['route', 'fixturePath', 'finalPath']) {
        const wrongRouteZip = writeBundle({
          desktop: receiptFor('desktop', { [field]: '/product' }),
          mobile: receiptFor('mobile'),
        });
        makeRecords({ artifact: { digest: sha256(wrongRouteZip) } });
        assert.match(issues(), /does not match the registered screen route/);
      }

      const priorPathOnly = process.env.PATH;
      process.env.PATH = priorPathOnly
        .split(':')
        .filter(entry => entry !== root)
        .join(':');
      try {
        assert.match(
          issues(),
          /controlled GitHub artifact resolver is unavailable/
        );
      } finally {
        process.env.PATH = priorPathOnly;
      }
    } finally {
      process.env.PATH = priorPath;
      if (priorDiffBase === undefined) delete process.env.SCREEN_CERT_DIFF_BASE;
      else process.env.SCREEN_CERT_DIFF_BASE = priorDiffBase;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('emits only a candidate; the emitter cannot self-certify', () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), 'screen-proof-emit-'));
    try {
      const bundle = join(artifactRoot, 'bundle');
      mkdirSync(bundle);
      writeFileSync(join(bundle, 'desktop.png'), 'candidate desktop bytes');
      writeFileSync(join(bundle, 'mobile.png'), 'candidate mobile bytes');
      const screen = home();
      const measurements = {
        capturedAt: '2026-09-03T00:00:00.000Z',
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
        visibleActions: ['Find me'],
      };
      const proof = emitScreenProof({
        screenId: screen.id,
        headSha: HEAD,
        runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123456789',
        bundle: 'bundle',
        measurements,
        artifactRoot,
        producerRunId: 123456789,
        producerRunAttempt: 2,
        producerJobId: 987654321,
        environment: 'local-production-build',
      });
      assert.equal(proof.schema, SCREEN_BROWSER_PROOF_SCHEMA);
      assert.equal(proof.status, 'unverified-candidate');
      assert.equal(proof.certificationStatus, 'not-certified');
      assert.equal(proof.artifactPath, 'bundle');
      assert.match(proof.artifactDigest, /^sha256:[0-9a-f]{64}$/);
      assert.deepEqual(
        [
          proof.producerRunId,
          proof.producerRunAttempt,
          proof.producerJobId,
          proof.environment,
        ],
        [123456789, 2, 987654321, 'local-production-build']
      );
      assert.deepEqual(proof.sourcePaths, [...screen.sources].sort());
      const measurementsPath = join(artifactRoot, 'measurements.json');
      const cliProofPath = join(artifactRoot, 'cli-proof.json');
      writeFileSync(measurementsPath, JSON.stringify(measurements));
      const cli = spawnSync(
        process.execPath,
        [
          join(ROOT, 'scripts/invariants/screen-proof-emit.mjs'),
          `--screen=${screen.id}`,
          `--head-sha=${HEAD}`,
          '--run-url=https://github.com/JovieInc/Jovie/actions/runs/123456789',
          '--bundle=bundle',
          `--measurements=${measurementsPath}`,
          `--out=${cliProofPath}`,
          `--artifact-root=${artifactRoot}`,
        ],
        { cwd: ROOT, encoding: 'utf8' }
      );
      assert.equal(cli.status, 0, cli.stderr);
      const cliProof = JSON.parse(readFileSync(cliProofPath, 'utf8'));
      assert.equal(cliProof.environment, undefined);
      assert.equal(cliProof.producerRunId, undefined);
      assert.throws(
        () =>
          emitScreenProof({
            screenId: screen.id,
            headSha: HEAD,
            runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123456789',
            bundle: 'bundle',
            measurements,
            artifactRoot,
            producerRunId: 123456789,
          }),
        /producer provenance requires positive run, attempt, and job IDs/
      );
      const result = runScreenCertification({
        headSha: HEAD,
        changedFiles: ['apps/web/app/(home)/page.tsx'],
        proofs: [proof],
      });
      assert.equal(result.receipt.certified, false);
      assert.equal(result.receipt.status, 'external-certification-unavailable');
      // The emitter refuses malformed candidate measurements.
      assert.throws(
        () =>
          emitScreenProof({
            screenId: screen.id,
            headSha: HEAD,
            runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123456789',
            bundle: 'bundle',
            measurements: {
              ...measurements,
              viewports: measurements.viewports.map((viewport, index) =>
                index === 0 ? { ...viewport, cls: { value: 0.5 } } : viewport
              ),
            },
            artifactRoot,
          }),
        /refusing to emit an invalid screen-proof candidate/
      );
    } finally {
      rmSync(artifactRoot, { force: true, recursive: true });
    }
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

  it('audits the landed head commit when the implicit base is the checkout tip (JOV-7293)', () => {
    // workflow_dispatch/push runs on main have no PR base or event.before;
    // the implicit origin/main fallback resolves to HEAD itself and used to
    // fail closed. ci-fast's changedFiles() convention for non-PR events is
    // HEAD^1, so the gate follows it.
    const repo = mkdtempSync(join(tmpdir(), 'screen-cert-diff-base-'));
    const runGit = args =>
      spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    const savedEnv = {
      SCREEN_CERT_DIFF_BASE: process.env.SCREEN_CERT_DIFF_BASE,
      COMPONENT_SHIP_DIFF_BASE: process.env.COMPONENT_SHIP_DIFF_BASE,
      TURBO_SCM_BASE: process.env.TURBO_SCM_BASE,
    };
    try {
      delete process.env.SCREEN_CERT_DIFF_BASE;
      delete process.env.COMPONENT_SHIP_DIFF_BASE;
      delete process.env.TURBO_SCM_BASE;
      assert.equal(runGit(['init', '--initial-branch=main']).status, 0);
      assert.equal(
        runGit(['config', 'user.email', 'ci-contract@jov.ie']).status,
        0
      );
      assert.equal(runGit(['config', 'user.name', 'CI Contract']).status, 0);
      writeFileSync(join(repo, 'a.txt'), 'a\n');
      assert.equal(runGit(['add', '.']).status, 0);
      assert.equal(runGit(['commit', '-m', 'base']).status, 0);
      const baseSha = runGit(['rev-parse', 'HEAD']).stdout.trim();
      writeFileSync(join(repo, 'b.txt'), 'b\n');
      assert.equal(runGit(['add', '.']).status, 0);
      assert.equal(runGit(['commit', '-m', 'tip']).status, 0);

      // Base tip checkout: origin/main == HEAD must not self-diff.
      assert.equal(
        runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD']).status,
        0
      );
      assert.equal(resolveDiffBase(undefined, repo), 'HEAD^1');

      // A real ancestor base still resolves to origin/main.
      assert.equal(
        runGit(['update-ref', 'refs/remotes/origin/main', baseSha]).status,
        0
      );
      assert.equal(resolveDiffBase(undefined, repo), 'origin/main');

      // No base ref fails closed as before.
      assert.equal(
        runGit(['update-ref', '-d', 'refs/remotes/origin/main']).status,
        0
      );
      assert.equal(resolveDiffBase(undefined, repo), null);
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(repo, { recursive: true, force: true });
    }
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

  it('registers the authenticated account and billing shells for changed-surface certification', () => {
    const shells = [
      ['web.account-shell', 'account-shell', 'apps/web/app/account/layout.tsx'],
      ['web.billing-shell', 'billing-shell', 'apps/web/app/billing/layout.tsx'],
    ];
    for (const [id, owner, source] of shells) {
      assert.deepEqual(
        SCREEN_REGISTRY.find(entry => entry.id === id),
        {
          id,
          platform: 'web',
          owner,
          sources: [source],
          viewports: ['desktop', 'mobile'],
        }
      );
    }

    const result = evaluateChangedScreens({
      changedFiles: shells.map(([, , source]) => ({
        path: source,
        status: 'M',
      })),
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      { id: 'web.account-shell', verdict: 'evidence-required', findings: [] },
      { id: 'web.billing-shell', verdict: 'evidence-required', findings: [] },
    ]);
  });

  it('keeps the billing success screen registered separately from the billing shell', () => {
    assert.equal(
      classifyScreenPath('apps/web/app/billing/success/page.tsx').entry?.id,
      'web.billing-success'
    );
  });

  it('registers the waitlist error boundary with the waitlist screen', () => {
    const result = evaluateChangedScreens({
      changedFiles: [{ path: 'apps/web/app/waitlist/error.tsx', status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      { id: 'web.waitlist', verdict: 'evidence-required', findings: [] },
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

  it('registers the engineering publication index as its own screen for changed-surface certification (JOV-7110)', () => {
    // JOV-7110: web.engineering-publication used to bundle both the /engineering
    // index and the /engineering/preview gallery as one screen, but the schema
    // binds exactly one manifest route per screen. Split into two ids below;
    // this one owns only the sources that render /engineering.
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.engineering-publication'
    );

    assert.deepEqual(screen, {
      id: 'web.engineering-publication',
      platform: 'web',
      owner: 'engineering-publication',
      sources: [
        'apps/web/app/(marketing)/engineering/page.tsx',
        'apps/web/app/(marketing)/engineering/[slug]/page.tsx',
      ],
      viewports: ['desktop', 'mobile'],
    });
    assert.equal(
      SCREEN_MARKETING_ROUTES['web.engineering-publication'],
      '/engineering'
    );

    const result = evaluateChangedScreens({
      changedFiles: [
        { path: 'apps/web/app/(marketing)/engineering/page.tsx', status: 'A' },
        {
          path: 'apps/web/app/(marketing)/engineering/[slug]/page.tsx',
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

  it('registers the engineering preview gallery as its own screen for changed-surface certification (JOV-7110)', () => {
    const source = 'apps/web/app/(marketing)/engineering/preview/';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.engineering-preview'
    );

    assert.deepEqual(screen, {
      id: 'web.engineering-preview',
      platform: 'web',
      owner: 'engineering-preview',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });
    assert.equal(
      SCREEN_MARKETING_ROUTES['web.engineering-preview'],
      '/engineering/preview'
    );

    const result = evaluateChangedScreens({
      changedFiles: [
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
        id: 'web.engineering-preview',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the marketing AI landing page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/ai/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-ai'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-ai',
      platform: 'web',
      owner: 'marketing-ai',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'A' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      { id: 'web.marketing-ai', verdict: 'evidence-required', findings: [] },
    ]);
  });

  it('registers the alternatives marketing surfaces for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/alternatives/';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-alternatives'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-alternatives',
      platform: 'web',
      owner: 'marketing-alternatives',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [
        {
          path: 'apps/web/app/(marketing)/alternatives/[slug]/page.tsx',
          status: 'M',
        },
      ],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-alternatives',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the marketing download page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/download/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-download'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-download',
      platform: 'web',
      owner: 'marketing-download',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-download',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the marketing card page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/card/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-card'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-card',
      platform: 'web',
      owner: 'marketing-card',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-card',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the marketing launch page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/launch/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-launch'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-launch',
      platform: 'web',
      owner: 'marketing-launch',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-launch',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the marketing product page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/product/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-product'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-product',
      platform: 'web',
      owner: 'marketing-product',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-product',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the marketing pricing page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/pricing/page.tsx';
    const layoutSource = 'apps/web/app/(marketing)/pricing/layout.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-pricing'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-pricing',
      platform: 'web',
      owner: 'marketing-pricing',
      sources: [source, layoutSource],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-pricing',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);

    const layoutResult = evaluateChangedScreens({
      changedFiles: [{ path: layoutSource, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(layoutResult.issues, []);
    assert.deepEqual(layoutResult.changedScreens, [
      {
        id: 'web.marketing-pricing',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the staged homepage v2 landing page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/new/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-new'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-new',
      platform: 'web',
      owner: 'marketing-new',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-new',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the marketing not-found page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/not-found.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-not-found'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-not-found',
      platform: 'web',
      owner: 'marketing-not-found',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-not-found',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the renders marketing surfaces for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/renders/';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-renders'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-renders',
      platform: 'web',
      owner: 'marketing-renders',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [
        { path: 'apps/web/app/(marketing)/renders/page.tsx', status: 'M' },
        {
          path: 'apps/web/app/(marketing)/renders/[state]/page.tsx',
          status: 'M',
        },
      ],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.marketing-renders',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the profile-mode render route for changed-surface certification', () => {
    const source = 'apps/web/app/[username]/profile-mode-render/';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.profile-mode-render'
    );

    assert.deepEqual(screen, {
      id: 'web.profile-mode-render',
      platform: 'web',
      owner: 'profile-mode-render',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [
        {
          path: 'apps/web/app/[username]/profile-mode-render/[profileMode]/[marker]/page.tsx',
          status: 'M',
        },
      ],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.profile-mode-render',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the guarded profile-admission fixture screen for changed-surface certification', () => {
    const source =
      'apps/web/app/(profile-admission)/renders/profile-admission/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.profile-admission'
    );

    assert.deepEqual(screen, {
      id: 'web.profile-admission',
      platform: 'web',
      owner: 'profile-admission',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.profile-admission',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the marketing shell layout for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/layout.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-shell'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-shell',
      platform: 'web',
      owner: 'marketing-shell',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      { id: 'web.marketing-shell', verdict: 'evidence-required', findings: [] },
    ]);
  });

  it('registers the app shell root not-found page for changed-surface certification', () => {
    const source = 'apps/web/app/app/not-found.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.app-not-found'
    );

    assert.deepEqual(screen, {
      id: 'web.app-not-found',
      platform: 'web',
      owner: 'app-shell-not-found',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.app-not-found',
        verdict: 'evidence-required',
        findings: [],
      },
    ]);
  });

  it('registers the experimental library surface for changed-surface certification', () => {
    const source = 'apps/web/app/exp/library-v1/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.exp-library-v1'
    );

    assert.deepEqual(screen, {
      id: 'web.exp-library-v1',
      platform: 'web',
      owner: 'exp-library-v1',
      sources: [source],
      viewports: ['desktop', 'mobile'],
    });

    const result = evaluateChangedScreens({
      changedFiles: [{ path: source, status: 'M' }],
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      {
        id: 'web.exp-library-v1',
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

  it('rejects unregistered visible boundary, desktop renderer, and iOS screen paths', () => {
    const paths = [
      'apps/web/app/(dynamic)/start/loading.tsx',
      'apps/web/app/billing/success/error.tsx',
      'apps/web/app/billing/success/not-found.tsx',
      'apps/desktop/src/renderer/App.tsx',
      'apps/ios/Jovie/Features/New/NewScreen.swift',
      'apps/ios/Jovie/Features/Chat/ComposerWorkflowSheet.swift',
      'apps/ios/Jovie/Features/Camera/CameraOverlayView.swift',
    ];
    for (const path of paths) {
      assert.equal(kindOf(path), 'unregistered', path);
    }
    const added = evaluateChangedScreens({
      changedFiles: [{ path: 'apps/web/app/new/page.tsx', status: 'A' }],
      headSha: HEAD,
      proofs: [],
      requireExternalEvidence: true,
    });
    assert.match(added.issues.join('\n'), /missing registration/);
  });

  it('records deleted unregistered screens as removed instead of demanding registration', () => {
    const result = evaluateChangedScreens({
      changedFiles: [
        { path: 'apps/web/app/new/page.tsx', status: 'D' },
        { path: 'apps/web/app/new/layout.tsx', status: 'D' },
        { path: 'apps/web/app/other/page.tsx', status: 'M' },
      ],
      headSha: HEAD,
      proofs: [],
      requireExternalEvidence: true,
    });
    assert.deepEqual(result.removedScreens, [
      'apps/web/app/new/page.tsx',
      'apps/web/app/new/layout.tsx',
    ]);
    assert.deepEqual(result.issues, [
      'missing registration for changed in-scope screen apps/web/app/other/page.tsx',
    ]);
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
