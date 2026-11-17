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
import {
  SCREEN_BROWSER_PROOF_SCHEMA,
  SCREEN_PROOF_ROUTES,
  SCREEN_REGISTRY,
} from './screen-certification.mjs';
import {
  finalPathMatches,
  SCREEN_PROOF_FINAL_PATHS,
} from './screen-proof-final-paths.mjs';
import {
  resolveTrustedScreenProof,
  screenProofArtifactName,
} from './screen-proof-resolver.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
/**
 * @param {string} path
 * @param {string} route
 * @param {Record<string, readonly string[]>} [declared]
 */
const lands = (path, route, declared) =>
  finalPathMatches(
    new URL(path, 'http://localhost:3000'),
    new URL(route, 'http://localhost'),
    declared
  );

// JOV-7973: closed public signup sends the anonymous /start entry to the
// waitlist. The screen proof resolver must accept exactly that declared
// landing, or every main screenshot run fails and no screen-audit receipt
// is ever written.
describe('screen proof final paths (JOV-7973)', () => {
  it('matches the exact route, or a declared bare alternate only', () => {
    assert.equal(lands('/start', '/start'), true);
    assert.equal(lands('/waitlist', '/start'), true);
    assert.equal(lands('/waitlist?ref=x', '/start'), false);
    assert.equal(lands('/signin', '/start'), false);
    assert.equal(lands('/waitlist', '/'), false);
    assert.equal(lands('/waitlist', '/start', {}), false);
    assert.equal(
      lands('/a?x=1', '/a?x=1'),
      true,
      'exact query routes keep matching'
    );
    assert.equal(
      lands('/waitlist', '/constructor', {}),
      false,
      'inherited keys never declare alternates'
    );
  });

  it('declares the closed-signup and open-signup handoffs', () => {
    assert.deepEqual(Object.keys(SCREEN_PROOF_FINAL_PATHS), [
      '/start',
      '/waitlist',
    ]);
    assert.ok(Object.isFrozen(SCREEN_PROOF_FINAL_PATHS));
    assert.ok(Object.isFrozen(SCREEN_PROOF_FINAL_PATHS['/start']));
    assert.ok(Object.isFrozen(SCREEN_PROOF_FINAL_PATHS['/waitlist']));
  });

  it('resolves web.start proof that lands on the declared /waitlist handoff, and nothing else', () => {
    // The public-screens producer follows the anonymous /start -> /waitlist
    // handoff while signup is closed. Before this, the resolver demanded a
    // /start final URL, so every main screenshot run failed web.start and
    // the screen-audit receipt producer never had an exact-build run.
    const root = mkdtempSync(join(tmpdir(), 'screen-resolver-start-waitlist-'));
    const priorPath = process.env.PATH;
    const screenId = 'web.start';
    const screen = SCREEN_REGISTRY.find(entry => entry.id === screenId);
    assert.ok(screen, `${screenId} must stay registered for this test`);
    const proofRoute = SCREEN_PROOF_ROUTES[screenId];
    assert.equal(proofRoute, '/start');
    assert.deepEqual([...SCREEN_PROOF_FINAL_PATHS[proofRoute]], ['/waitlist']);
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
        visibleActions: ['Join the waitlist'],
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

      const digest = createHash('sha256');
      for (const [name, bytes] of images) {
        digest.update(name);
        digest.update('\0');
        digest.update(bytes);
        digest.update('\0');
      }
      const artifactDigest = `sha256:${digest.digest('hex')}`;
      const resolveFinal = finalUrl => {
        const proof = buildProof(finalUrl);
        proof.artifactDigest = artifactDigest;
        writeFileSync(
          join(root, 'records.json'),
          JSON.stringify(makeRecords(buildArchive(proof)))
        );
        return resolveTrustedScreenProof({ artifactId: 44, context });
      };

      // 1. The exact route and the declared handoff both resolve.
      for (const finalUrl of [
        'http://localhost:3000/start',
        'http://localhost:3000/waitlist',
      ]) {
        const resolved = resolveFinal(finalUrl);
        assert.deepEqual(resolved.findings, [], finalUrl);
        assert.equal(resolved.proof?.screenId, screenId);
      }

      // 2. Any other landing, or the handoff with a query, still fails.
      for (const finalUrl of [
        'http://localhost:3000/signin',
        'http://localhost:3000/waitlist?ref=x',
        'https://jov.ie/waitlist',
      ]) {
        const rejected = resolveFinal(finalUrl);
        assert.equal(rejected.proof, null, finalUrl);
        assert.match(
          rejected.findings.join('\n'),
          /required browser measurements are unavailable/
        );
      }
    } finally {
      process.env.PATH = priorPath;
      rmSync(root, { force: true, recursive: true });
    }
  });
});
