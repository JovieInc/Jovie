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
import { emitScreenProof } from './screen-proof-emit.mjs';
import {
  MARKETING_EVIDENCE_SCHEMA,
  marketingArtifactName,
  PRODUCER,
  REQUIRED_MARKETING_QUALITY_CHECKS,
  resolveTrustedScreenProof,
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
    assert.equal(
      kindOf('apps/ios/Jovie/Features/Chat/MobileChatView.swift'),
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

  it('registers public SmartLink release and track pages', () => {
    assert.equal(
      kindOf('apps/web/app/[username]/[slug]/page.tsx'),
      'registered'
    );
    assert.equal(
      kindOf('apps/web/app/[username]/[slug]/[trackSlug]/page.tsx'),
      'registered'
    );
    const result = evaluateChangedScreens({
      changedFiles: [
        { path: 'apps/web/app/[username]/[slug]/page.tsx', status: 'M' },
        {
          path: 'apps/web/app/[username]/[slug]/[trackSlug]/page.tsx',
          status: 'M',
        },
      ],
      headSha: HEAD,
      proofs: [],
    });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.changedScreens.map(screen => screen.id).sort(), [
      'web.smartlink-release',
      'web.smartlink-track',
    ]);
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
      const certify = () =>
        runScreenCertificationFromArtifact({
          artifactId: 42,
          screenId: 'web.homepage',
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
      const records = {
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
            name: 'screen-browser-proof',
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
      assert.equal(
        spawnSync(
          'zip',
          [
            '-q',
            'proof.zip',
            'home-desktop/receipt.json',
            'home-desktop/marketing-route.png',
            'home-mobile/receipt.json',
            'home-mobile/marketing-route.png',
          ],
          { cwd: root }
        ).status,
        0
      );
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
        assert.equal(
          spawnSync(
            'zip',
            [
              '-q',
              'proof.zip',
              'home-desktop/receipt.json',
              'home-desktop/marketing-route.png',
              'home-mobile/receipt.json',
              'home-mobile/marketing-route.png',
            ],
            { cwd: root }
          ).status,
          0
        );
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
    const screen = SCREEN_REGISTRY.find(
      entry => entry.id === 'web.marketing-pricing'
    );

    assert.deepEqual(screen, {
      id: 'web.marketing-pricing',
      platform: 'web',
      owner: 'marketing-pricing',
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
        id: 'web.marketing-pricing',
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
