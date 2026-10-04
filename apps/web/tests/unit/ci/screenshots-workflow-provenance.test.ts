import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import * as realGhHarness from '../../../../../scripts/lib/real-gh-harness.mjs';

// JOV-7707: Product Screenshots provenance is checked from parsed workflow
// YAML, and the bind, restore and certify shell is executed. Screen proofs are
// discovered from the workflow, so adding one needs no test edit beyond its
// trigger path.

const { resolveRealGh, runWithRealGh } = realGhHarness as unknown as {
  resolveRealGh: () => string | null;
  runWithRealGh: (options: {
    script: string;
    env?: Record<string, string>;
    route: (path: string) => { status?: number; body: unknown } | null;
  }) => Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    requests: string[];
  }>;
};

type Step = {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  name?: string;
  needs?: string | string[];
  if?: string;
  'continue-on-error'?: boolean;
  env?: Record<string, string>;
  outputs?: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  on: { push: { paths: string[] } };
  jobs: Record<string, Job>;
};

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const workflowSource = readFileSync(
  resolve(repoRoot, '.github/workflows/screenshots.yml'),
  'utf8'
);
const workflow = parseYaml(workflowSource) as Workflow;
const { generate, publish, certify } = workflow.jobs as Record<string, Job>;
const safeUpload = './.github/actions/upload-safe-playwright-artifact';
const gh = resolveRealGh();
if (!gh && process.env.CI) {
  throw new Error('JOV-7707: CI must provide the real gh binary.');
}
const roots: string[] = [];
// Fixture git must never inherit a hook's GIT_DIR (it would hit the real repo).
const fixtureEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
  ) as NodeJS.ProcessEnv;

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function tempRoot(prefix: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

function step(job: Job | undefined, name: string) {
  const index = job?.steps.findIndex(entry => entry.name === name) ?? -1;
  expect(index, `missing step: ${name}`).toBeGreaterThanOrEqual(0);
  return { index, step: job?.steps[index] as Step };
}

function matchesLiteralDirectoryFilter(pattern: string, path: string): boolean {
  const recursiveSuffix = '/**';
  if (!pattern.endsWith(recursiveSuffix)) return false;

  const escapedPrefix = pattern.slice(0, -recursiveSuffix.length);
  if (/(^|[^\\])[*[\]!?+]/.test(escapedPrefix)) return false;

  const prefix = escapedPrefix.replace(/\\([*[\]!?+])/g, '$1');
  return path === prefix || path.startsWith(`${prefix}/`);
}

const triggersOn = (path: string) =>
  workflow.on.push.paths.some(
    pattern =>
      matchesLiteralDirectoryFilter(pattern, path) ||
      (!pattern.includes('\\') && matchesGlob(path, pattern))
  );

// Screen proofs, discovered from `Capture <label> screen proof` steps. The
// upload id, job output and screen id follow from the workflow itself.
const screenProofs = generate.steps.flatMap((capture, index) => {
  const label = capture.name?.match(/^Capture (.+) screen proof$/)?.[1];
  if (!label) return [];
  const upload = generate.steps.find(
    entry => entry.name === `Upload ${label} screen proof`
  );
  const bind = generate.steps.find(
    entry => entry.name === `Bind ${label} proof to producer provenance`
  );
  const output = Object.entries(generate.outputs ?? {}).find(
    ([, value]) => value === `\${{ steps.${upload?.id}.outputs.artifact-id }}`
  )?.[0];
  const screenId = bind?.run?.match(/--screen=(web\.[a-z-]+)/)?.[1];
  return [{ label, index, capture, bind, upload, output, screenId }];
});

// A source path per screen proof that must rerun the workflow.
const screenSources: Record<string, string> = {
  'web.public-profile': 'apps/web/app/[username]/page.tsx',
  'web.artists': 'apps/web/app/artists/page.tsx',
  'web.smartlink-release': 'apps/web/app/r/page.tsx',
  'web.smartlink-track': 'apps/web/app/s/page.tsx',
  'web.hud-isolated': 'apps/web/app/hud/page.tsx',
  'web.tasks': 'apps/web/app/app/(shell)/tasks/page.tsx',
  'web.contacts': 'apps/web/app/app/(shell)/contacts/page.tsx',
};

describe('Product Screenshots provenance', () => {
  it('discovers every screen proof with a capture, bind, upload and job output', () => {
    expect(screenProofs.length).toBeGreaterThanOrEqual(7);
    const verify = step(
      generate,
      'Verify public screenshot exports from production build'
    ).index;
    for (const proof of screenProofs) {
      expect(proof.bind, proof.label).toBeDefined();
      expect(proof.upload?.uses, proof.label).toBe(safeUpload);
      expect(proof.output, proof.label).toMatch(/-artifact-id$/);
      expect(proof.screenId, proof.label).toBeDefined();
      const order = [proof.capture, proof.bind, proof.upload].map(entry =>
        generate.steps.indexOf(entry as Step)
      );
      expect(order, proof.label).toEqual([...order].sort((a, b) => a - b));
      expect(order[2], proof.label).toBeLessThan(verify);
      const paths = String(proof.upload?.with?.path).trim().split('\n');
      expect(paths.map(path => path.split('/').slice(-2).join('/'))).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/screen-proof\.json$/),
          'screenshots/desktop.png',
          'screenshots/mobile.png',
        ])
      );
      expect(proof.upload?.with?.['if-no-files-found']).toBe('error');
    }
    // upload-artifact forbids reusing a name within one run.
    const names = screenProofs.map(proof => proof.upload?.with?.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('reruns when any screen proof source or the producer transport changes', () => {
    for (const proof of screenProofs) {
      const source = screenSources[String(proof.screenId)];
      expect(source, `trigger path for ${proof.screenId}`).toBeDefined();
      expect(triggersOn(String(source)), String(source)).toBe(true);
    }
    for (const path of [
      '.github/actions/upload-safe-playwright-artifact/action.yml',
      '.github/scripts/guard-playwright-artifacts.mjs',
      '.github/workflows/screenshots.yml',
      'apps/web/scripts/check-screenshot-catalog.ts',
      'apps/web/scripts/png-optimization.ts',
      'apps/web/scripts/stage-screenshot-catalog-transfer.ts',
      'apps/web/scripts/sync-screenshot-public-export.ts',
      'apps/web/data/marketing/routes.ts',
      'apps/web/lib/agent-os/visual-qa/index.ts',
      'apps/web/tests/visual-qa/spec.ts',
    ])
      expect(triggersOn(path), path).toBe(true);
    // Escaped brackets match the literal route segment only.
    expect(triggersOn('apps/web/app/u/page.tsx')).toBe(false);
    expect(
      matchesLiteralDirectoryFilter(
        'apps/web/app/\\[username\\]/**',
        'apps/web/app/username/page.tsx'
      )
    ).toBe(false);
  });

  it.skipIf(!gh)(
    'binds each proof to the exact producer job or refuses to emit',
    async () => {
      for (const proof of screenProofs) {
        const root = tempRoot('jovie-screen-proof-bind-');
        const bin = join(root, 'bin');
        mkdirSync(bin);
        writeFileSync(
          join(bin, 'node'),
          `#!/bin/sh\nprintf '%s\\n' "$@" > "${root}/emit-args"\n`,
          { mode: 0o755 }
        );
        const run = (jobs: unknown[]) =>
          runWithRealGh({
            script: String(proof.bind?.run),
            env: {
              // The harness-resolved real gh's directory must lead the host
              // PATH: hosts like lane_runner prepend a `#!` gh shim that
              // mints a token the harness HOME cannot provide.
              PATH: `${dirname(String(gh))}:${bin}:${process.env.PATH ?? ''}`,
              GITHUB_REPOSITORY: 'JovieInc/Jovie',
              GITHUB_RUN_ID: '900',
              GITHUB_RUN_ATTEMPT: '2',
              GITHUB_SHA: 'a'.repeat(40),
              GITHUB_SERVER_URL: 'https://github.com',
              GITHUB_WORKSPACE: root,
            },
            route: path =>
              path ===
              'repos/JovieInc/Jovie/actions/runs/900/attempts/2/jobs?per_page=100'
                ? { body: { jobs } }
                : null,
          });

        const missing = await run([{ id: 5, name: 'Certify Screenshots' }]);
        expect(missing.code, proof.label).toBe(1);
        expect(existsSync(join(root, 'emit-args')), proof.label).toBe(false);

        const bound = await run([
          { id: 5, name: 'Certify Screenshots' },
          { id: 77, name: String(generate.name) },
        ]);
        expect(bound.code, `${proof.label}: ${bound.stderr}`).toBe(0);
        const args = readFileSync(join(root, 'emit-args'), 'utf8').split('\n');
        expect(args).toEqual(
          expect.arrayContaining([
            `--screen=${proof.screenId}`,
            '--producer-job-id=77',
            '--producer-run-id=900',
            '--producer-run-attempt=2',
          ])
        );
      }
    },
    // Two real gh runs per discovered screen.
    60_000
  );

  it('certifies every screen independently and still fails red', () => {
    const certifyStep = step(certify, 'Certify exact screen captures').step;
    expect(certify.if).toBe('${{ always() }}');
    expect(certify.needs).toBe('generate');
    expect(certifyStep.env).toMatchObject({
      SCREEN_CERT_ARTIFACT_ID:
        '${{ needs.generate.outputs.marketing-artifact-id }}',
      SCREEN_CERT_MARKETING_ARTIFACT:
        'marketing-route-screenshots-${{ github.sha }}',
    });
    const receipts = step(certify, 'Upload screen certification receipts').step;
    expect(receipts.if).toBe(
      "always() && hashFiles('.artifacts/screen-certification/*.json') != ''"
    );

    const root = tempRoot('jovie-screen-certify-');
    const bin = join(root, 'bin');
    mkdirSync(bin);
    // Every certification call is recorded; web.artists fails.
    writeFileSync(
      join(bin, 'node'),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${root}/calls"\ncase "$*" in *--screen-id=web.artists*) exit 3;; esac\n`,
      { mode: 0o755 }
    );
    const script = String(certifyStep.run)
      .replace(/\$\{\{ github\.event\.before \}\}/g, 'b'.repeat(40))
      .replace(
        /\$\{\{ needs\.generate\.outputs\.([a-z-]+) \}\}/g,
        (_match, output: string) => `artifact-for-${output}`
      );
    execFileSync('git', ['init', '-q', root], { env: fixtureEnv() });
    const result = spawnSync('bash', ['-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: { ...fixtureEnv(), PATH: `${bin}:${process.env.PATH ?? ''}` },
    });
    expect(result.status).toBe(3);
    const calls = readFileSync(join(root, 'calls'), 'utf8');
    for (const proof of screenProofs) {
      expect(calls, String(proof.screenId)).toContain(
        `--artifact-id=artifact-for-${proof.output} --screen-id=${proof.screenId}`
      );
    }
  });

  it('captures from a clean exact-head tree served by the production build', () => {
    const checkout = generate.steps.find(entry =>
      entry.uses?.startsWith('actions/checkout@')
    );
    expect(checkout?.with).toMatchObject({
      'fetch-depth': 0,
      'persist-credentials': false,
    });
    const start = step(generate, 'Start production server');
    const restore = step(generate, 'Restore clean source tree for provenance');
    const verify = step(
      generate,
      'Verify public screenshot exports from production build'
    );
    const marketing = step(generate, 'Capture exact marketing routes');
    const catalog = step(generate, 'Capture screenshot catalog');
    expect(start.index).toBeLessThan(restore.index);
    expect(restore.index).toBeLessThan(marketing.index);
    expect(verify.index).toBeLessThan(catalog.index);
    expect(start.step.env?.HOSTNAME).toBe('localhost');
    for (const capture of [marketing.step, verify.step])
      expect(capture.env?.SCREENSHOT_BUILD_MODE).toBe('production');
    expect(verify.step.env?.BASE_URL).toBe('http://localhost:3000');
    expect(String(verify.step.run)).toContain('public-export-serving.spec.ts');
    // The long-lived server only sees job env set before it starts.
    expect(generate.env).toMatchObject({
      E2E_VISUAL_CAPTURE_SYNTHETIC_AUTH: '1',
      E2E_FAST_ONBOARDING: '1',
    });
  });

  it('restores tracked and untracked sources but keeps ignored build output', () => {
    const restore = step(
      generate,
      'Restore clean source tree for provenance'
    ).step;
    expect(restore['working-directory' as keyof Step]).toBe('.');
    const root = tempRoot('jovie-screenshot-restore-');
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        env: fixtureEnv(),
      });
    git('init', '-q');
    git('config', 'user.email', 'restore@example.test');
    git('config', 'user.name', 'restore');
    writeFileSync(join(root, '.gitignore'), '.next/\n');
    writeFileSync(join(root, 'page.tsx'), 'committed\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    writeFileSync(join(root, 'page.tsx'), 'edited by the build\n');
    writeFileSync(join(root, 'generated.ts'), 'untracked\n');
    mkdirSync(join(root, '.next'));
    writeFileSync(join(root, '.next/server.js'), 'build output\n');
    const run = () =>
      spawnSync('bash', ['-c', String(restore.run)], {
        cwd: root,
        encoding: 'utf8',
        env: fixtureEnv(),
      });

    const clean = run();
    expect(clean.status, clean.stderr).toBe(0);
    expect(readFileSync(join(root, 'page.tsx'), 'utf8')).toBe('committed\n');
    expect(existsSync(join(root, 'generated.ts'))).toBe(false);
    expect(existsSync(join(root, '.next/server.js'))).toBe(true);

    // A nested repository survives `git clean -fd`, so the tree stays dirty.
    mkdirSync(join(root, 'nested'));
    git('-C', join(root, 'nested'), 'init', '-q');
    writeFileSync(join(root, 'nested/file'), 'x\n');
    const dirty = run();
    expect(dirty.status).toBe(1);
    expect(dirty.stdout).toContain('still dirty');
  });

  it('keeps proof production free of publication credentials', () => {
    expect(generate.name).toBe('Generate Screenshots');
    expect(JSON.stringify(generate)).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    const stage = step(
      generate,
      'Stage generated screenshot catalog for transfer'
    );
    const upload = step(generate, 'Upload generated screenshot catalog');
    expect(stage.index).toBeLessThan(upload.index);
    expect(upload.step.with?.path).toBe(
      '.artifacts/screenshot-catalog-transfer/'
    );
    expect(publish.name).toBe('Publish Screenshot Catalog');
    expect(publish.needs).toBe('generate');
    expect(publish['continue-on-error']).toBe(true);
    const download = step(publish, 'Download generated screenshot catalog');
    const pr = step(publish, 'Create or update screenshot PR');
    expect(download.step.with?.path).toBe('.');
    expect(download.index).toBeLessThan(pr.index);
    expect(JSON.stringify(publish)).toContain('JOVIE_BOT_PRIVATE_KEY');
    // Certification must not wait on, or fail with, catalog publication.
    expect(certify.needs).toBe('generate');
  });
});
