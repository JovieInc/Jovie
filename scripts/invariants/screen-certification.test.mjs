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
  runScreenCertificationFromArtifact,
  SCREEN_BROWSER_PROOF_SCHEMA,
  SCREEN_CERT_INVARIANT_ID,
  SCREEN_CERT_SCHEMA,
  SCREEN_PLATFORMS,
  SCREEN_REGISTRATION_GATE,
  SCREEN_REGISTRY,
  validateProtectedRevenueScreenRegistry,
  validateRetainedSweeps,
  validateScreenRegistry,
  verifyProofArtifact,
} from './screen-certification.mjs';
import { emitScreenProof } from './screen-proof-emit.mjs';
import { resolveTrustedScreenProof } from './screen-proof-resolver.mjs';

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

  it('registers dedicated homepage sections without claiming shared marketing CSS', () => {
    const screen = home();
    const sources = [
      'apps/web/components/homepage/HomepageCertifiedSections.tsx',
      'apps/web/components/homepage/HomepageClose.tsx',
    ];
    assert.ok(sources.every(source => screen.sources.includes(source)));
    assert.equal(screen.sources.includes('apps/web/styles/home.css'), false);
    const result = evaluateChangedScreens({
      changedFiles: sources.map(path => ({ path, status: 'M' })),
      headSha: HEAD,
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens, [
      { id: 'web.homepage', verdict: 'evidence-required', findings: [] },
    ]);
  });

  it('fails closed until a trusted browser producer adapter is integrated', () => {
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

  it('uses owned GitHub artifact transport for the explicit resolver entry (unit proof only)', () => {
    const root = mkdtempSync(join(tmpdir(), 'screen-resolver-gh-'));
    const priorPath = process.env.PATH;
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
        sourcePaths: ['apps/web/app/(home)/page.tsx'],
        sourceBaseSha: 'b'.repeat(40),
        stateScope: 'homepage-cookie-state-observed',
        capturedAt: iso(-60_000),
        artifactDigest: `sha256:${digest.digest('hex')}`,
        runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/77/attempts/3',
        producerRunId: 77,
        producerRunAttempt: 3,
        producerJobId: 99,
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
      const zip = readFileSync(join(root, 'proof.zip'));
      let records = {
        artifact: {
          id: 42,
          name: 'screen-browser-proof',
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
        compare: {
          status: 'ahead',
          ahead_by: 2,
          behind_by: 0,
          total_commits: 2,
          base_commit: { sha: 'b'.repeat(40) },
          merge_base_commit: { sha: 'b'.repeat(40) },
          commits: [{ sha: 'c'.repeat(40) }, { sha: head }],
          files: [
            {
              filename: 'apps/web/app/(home)/page.tsx',
              status: 'modified',
            },
          ],
        },
        headCommit: { sha: head },
      };
      const gh = join(root, 'gh');
      writeFileSync(
        gh,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.argv.at(-1);const r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(p.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'proof.zip'))}));else process.stdout.write(JSON.stringify(p.includes('/artifacts/')?r.artifact:p.includes('/attempts/')?r.jobs:p.includes('/compare/')?r.compare:p.includes('/commits/')?r.headCommit:r.run));`
      );
      const git = join(root, 'git');
      writeFileSync(
        git,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const a=process.argv.slice(2),r=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'records.json'))}));if(a[0]==='rev-parse')process.stdout.write(r.run.head_sha);else if(a[0]==='diff')process.stdout.write(r.changed);else process.exit(1);`
      );
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      chmodSync(gh, 0o755);
      chmodSync(git, 0o755);
      process.env.PATH = `${root}:${priorPath}`;
      const certify = () =>
        runScreenCertificationFromArtifact({
          artifactId: 42,
          screenId: 'web.homepage',
        });
      const result = certify();
      assert.equal(result.receipt.certified, true);

      const resolverContext = {
        headSha: head,
        screenId: 'web.homepage',
        viewports: ['desktop', 'mobile'],
      };
      assert.deepEqual(
        resolveTrustedScreenProof({ artifactId: 42, context: resolverContext })
          .changedFiles,
        [{ path: 'apps/web/app/(home)/page.tsx', status: 'M' }]
      );
      records.compare.files = [
        { filename: 'apps/web/app/(home)/page.tsx', status: 'removed' },
      ];
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      assert.deepEqual(
        resolveTrustedScreenProof({ artifactId: 42, context: resolverContext })
          .changedFiles,
        [{ path: 'apps/web/app/(home)/page.tsx', status: 'D' }]
      );
      records.compare.files = [
        { filename: 'apps/web/app/(home)/page.tsx', status: 'modified' },
      ];
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));

      const baselineProof = structuredClone(proof);
      const baselineRecords = structuredClone(records);
      let screenshot = image;
      const rebuild = () => {
        writeFileSync(join(root, 'screen-proof.json'), JSON.stringify(proof));
        for (const [name] of images)
          writeFileSync(join(root, name), screenshot);
        rmSync(join(root, 'proof.zip'));
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
        assert.equal(certify().receipt.certified, false);
      };
      /** @type {[boolean, () => void][]} */
      const negativeCases = [
        [false, () => (records.run.head_sha = 'b'.repeat(40))],
        [false, () => (records.run.repository.full_name = 'attacker/Jovie')],
        [false, () => (records.run.path = '.github/workflows/other.yml')],
        [false, () => (records.run.event = 'workflow_dispatch')],
        [false, () => (records.jobs.jobs[0].name = 'Invented producer')],
        [false, () => (records.jobs.jobs[0].run_attempt = 0)],
        [false, () => (records.artifact.created_at = iso(-9 * 60_000))],
        [false, () => (records.artifact.digest = sha256('modified artifact'))],
        [true, () => (proof.environment = 'preview')],
        [true, () => (proof.sourceBaseSha = 'c'.repeat(40))],
        [true, () => (proof.capturedAt = iso(9 * 60_000))],
        [
          true,
          () => {
            proof.producerRunId = 999;
            proof.runUrl = 'https://example.test/invented-run';
          },
        ],
        [true, () => proof.sourcePaths.push('apps/web/app/(home)/layout.tsx')],
        [true, () => delete proof.viewports[0].contrast],
        [true, () => (screenshot = Buffer.alloc(0))],
        [false, () => (records.compare.merge_base_commit.sha = 'c'.repeat(40))],
        [false, () => (records.headCommit.sha = 'c'.repeat(40))],
        [false, () => (records.compare.commits.at(-1).sha = 'c'.repeat(40))],
        [
          false,
          () => {
            records.compare.total_commits = 251;
            records.compare.commits = Array.from(
              { length: 251 },
              (_, index) => ({
                sha: index === 250 ? head : 'c'.repeat(40),
              })
            );
          },
        ],
        [false, () => (records.compare.files = [])],
        [
          false,
          () =>
            (records.compare.files = [
              { filename: 'apps/web/app/(home)/page.tsx', status: 'toString' },
            ]),
        ],
        [
          false,
          () =>
            (records.compare.files = Array.from({ length: 300 }, () => ({
              filename: 'apps/web/app/(home)/page.tsx',
              status: 'modified',
            }))),
        ],
        [
          false,
          () =>
            records.compare.files.push({
              filename: 'apps/web/app/waitlist/page.tsx',
              status: 'modified',
            }),
        ],
      ];
      for (const [archive, mutate] of negativeCases)
        rejects({ archive, mutate });
      Object.assign(proof, structuredClone(baselineProof));
      records = structuredClone(baselineRecords);
      records.compare.files.push({
        filename: 'apps/web/app/waitlist/page.tsx',
        status: 'modified',
      });
      writeFileSync(join(root, 'records.json'), JSON.stringify(records));
      const widened = runScreenCertificationFromArtifact({
        artifactId: 42,
        screenId: 'web.homepage',
      });
      assert.deepEqual([widened.ok, widened.receipt.ok], [false, false]);
    } finally {
      process.env.PATH = priorPath;
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
          contrast: { passed: true, method: 'computed-style', samples: 1 },
        })),
        activeFlow: { disclosure: false },
        historyProof: { separate: true, path: 'docs/VISUAL_TESTING_POLICY.md' },
        visibleActions: ['Find me'],
      };
      const emit = measurements =>
        emitScreenProof({
          screenId: screen.id,
          headSha: HEAD,
          sourceBaseSha: 'b'.repeat(40),
          environment: 'local-production-build',
          sourcePaths: ['apps/web/app/(home)/page.tsx'],
          producerRunId: 123456789,
          producerRunAttempt: 1,
          producerJobId: 99,
          stateScope: 'homepage-cookie-state-observed',
          bundle: 'bundle',
          artifactRoot,
          measurements,
        });
      const proof = emit(measurements);
      assert.equal(proof.schema, SCREEN_BROWSER_PROOF_SCHEMA);
      assert.equal(proof.status, 'unverified-candidate');
      assert.equal(proof.certificationStatus, 'not-certified');
      assert.equal(proof.environment, 'local-production-build');
      assert.equal(proof.producerRunAttempt, 1);
      assert.equal(proof.sourceBaseSha, 'b'.repeat(40));
      assert.equal(proof.stateScope, 'homepage-cookie-state-observed');
      assert.equal(proof.artifactPath, 'bundle');
      assert.match(proof.artifactDigest, /^sha256:[0-9a-f]{64}$/);
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
          emit({
            ...measurements,
            viewports: measurements.viewports.map((viewport, index) =>
              index === 0 ? { ...viewport, cls: { value: 0.5 } } : viewport
            ),
          }),
        /refusing to emit an invalid screen-proof candidate/
      );
      assert.throws(
        () =>
          emit({
            ...measurements,
            viewports: measurements.viewports.map(
              ({ contrast, ...viewport }) => viewport
            ),
          }),
        /candidate contrast must be independently measured/
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

  it('registers the marketing investors page for changed-surface certification', () => {
    const source = 'apps/web/app/(marketing)/investors/page.tsx';
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-investors'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-investors',
      platform: 'web',
      owner: 'marketing-investors',
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
        id: 'web.marketing-investors',
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
