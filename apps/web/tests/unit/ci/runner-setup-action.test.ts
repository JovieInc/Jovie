import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

// JOV-7707: the setup action is checked from its parsed YAML. Step `if:`
// expressions are evaluated for each event, and the prune shell runs against
// a fixture .pnpm tree.
type ActionStep = {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
const setupAction = parseYaml(
  readFileSync(
    resolve(repoRoot, '.github/actions/setup-node-pnpm/action.yml'),
    'utf8'
  )
) as {
  inputs: Record<string, { default?: string }>;
  runs: { steps: ActionStep[] };
};
const actionSteps = setupAction.runs.steps;
const actionStep = (name: string) => {
  const found = actionSteps.find(step => step.name === name);
  expect(found, name).toBeDefined();
  return found as ActionStep;
};
const stepIndex = (name: string) =>
  actionSteps.findIndex(step => step.name === name);

// Minimal GitHub Actions expression evaluator: literals, context paths,
// ==, !=, !, &&, || and parentheses (all the setup action uses).
function evaluateCondition(
  expression: string | undefined,
  context: Record<string, string>
): boolean {
  if (!expression) return true;
  const tokens =
    expression
      .replace(/^\$\{\{|\}\}$/g, '')
      .match(/'[^']*'|==|!=|&&|\|\||!|\(|\)|[A-Za-z_][\w.-]*/g) ?? [];
  const source = tokens
    .map(token => {
      if (token.startsWith("'")) return JSON.stringify(token.slice(1, -1));
      if (token === '==') return '===';
      if (token === '!=') return '!==';
      if (['&&', '||', '!', '(', ')'].includes(token)) return token;
      if (token === 'true' || token === 'false') return `'${token}'`;
      return `(ctx[${JSON.stringify(token)}] ?? '')`;
    })
    .join(' ');
  return Boolean(new Function('ctx', `return (${source});`)(context));
}

describe('self-hosted runner setup action', () => {
  const pruneRoots: string[] = [];
  afterEach(() => {
    for (const root of pruneRoots.splice(0))
      rmSync(root, { recursive: true, force: true });
  });
  const coldHosted = {
    'steps.runner-prereqs.outputs.dependencies_warm': 'false',
    'runner.environment': 'github-hosted',
    'runner.os': 'Linux',
    'inputs.package_cache': 'true',
    'inputs.reuse_merge_group_workspace': 'false',
    'inputs.save_merge_group_workspace': 'false',
    'steps.node-modules-cache.outcome': 'success',
    'steps.node-modules-cache.outputs.cache-hit': 'false',
    'github.event_name': 'push',
    'github.repository': 'JovieInc/Jovie',
    'github.event.pull_request.head.repo.full_name': 'JovieInc/Jovie',
  };

  it('never saves pnpm stores and installs the pinned pnpm from the lockfile', () => {
    expect(
      actionSteps.filter(step => /^actions\/cache@/.test(step.uses ?? ''))
    ).toEqual([]);
    expect(JSON.stringify(setupAction)).not.toContain('STORE_PATH');
    expect(actionStep('Warm pnpm store').run).toContain(
      'pnpm fetch --frozen-lockfile'
    );
    expect(actionStep('Install dependencies').run).toContain(
      'pnpm install --frozen-lockfile'
    );
    const pnpm = actionStep('Setup pnpm');
    expect(pnpm.uses).toBe(
      'pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320'
    );
    expect(pnpm.with?.dest).toBe('${{ runner.temp }}/setup-pnpm');
  });

  it('checks the baked image first and skips setup and fetch when it is warm', () => {
    const verify = stepIndex('Verify baked runner prerequisites');
    expect(actionSteps[verify]?.id).toBe('runner-prereqs');
    expect(actionSteps[verify]?.run).toContain(
      'verify-prerequisites.mjs --component dependencies'
    );
    const warm = {
      ...coldHosted,
      'steps.runner-prereqs.outputs.dependencies_warm': 'true',
    };
    for (const name of [
      'Setup pnpm',
      'Restore installed node_modules (GitHub-hosted)',
      'Setup Node.js with pnpm cache',
      'Warm pnpm store',
    ]) {
      expect(stepIndex(name), name).toBeGreaterThan(verify);
      expect(evaluateCondition(actionStep(name).if, warm), name).toBe(false);
      expect(evaluateCondition(actionStep(name).if, coldHosted), name).toBe(
        true
      );
    }
  });

  it('restores an exact installed tree only on GitHub-hosted runners', () => {
    const restore = actionStep(
      'Restore installed node_modules (GitHub-hosted)'
    );
    expect(restore.id).toBe('node-modules-cache');
    expect(restore.uses).toBe(
      'actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'
    );
    expect(String(restore.with?.path).trim().split('\n')).toEqual([
      'node_modules',
      'apps/*/node_modules',
      'packages/*/node_modules',
      'workers/*/node_modules',
    ]);
    // The key binds OS, arch, Node pin, lockfile, workspace, patches and
    // .npmrc, and no prefix match may restore a stale tree.
    expect(restore.with?.key).toBe(
      "pnpm-node-modules-v4-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('.nvmrc') }}-${{ hashFiles('pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'package.json', 'apps/*/package.json', 'packages/*/package.json', 'workers/*/package.json', 'patches/**') }}"
    );
    expect(restore.with).not.toHaveProperty('restore-keys');
    for (const environment of ['self-hosted', ''])
      expect(
        evaluateCondition(restore.if, {
          ...coldHosted,
          'runner.environment': environment,
        })
      ).toBe(false);
    expect(
      evaluateCondition(restore.if, {
        ...coldHosted,
        'inputs.package_cache': 'false',
      })
    ).toBe(false);
  });

  it('skips the pnpm store and fetch only on an exact installed-tree hit', () => {
    const hit = {
      ...coldHosted,
      'steps.node-modules-cache.outputs.cache-hit': 'true',
    };
    expect(evaluateCondition(actionStep('Warm pnpm store').if, hit)).toBe(
      false
    );
    const setupNode = actionStep('Setup Node.js with pnpm cache');
    expect(setupNode.with?.['node-version-file']).toBe('.nvmrc');
    expect(setupNode.with?.['cache-dependency-path']).toBe('**/pnpm-lock.yaml');
    // setup-node's own cache: hosted, enabled, not merge groups, no tree hit.
    const cacheExpression = String(setupNode.with?.cache).replace(
      / && 'pnpm' \|\| ''/,
      ''
    );
    expect(evaluateCondition(cacheExpression, coldHosted)).toBe(true);
    for (const override of [
      { 'steps.node-modules-cache.outputs.cache-hit': 'true' },
      { 'runner.environment': 'self-hosted' },
      { 'github.event_name': 'merge_group' },
      { 'inputs.package_cache': 'false' },
    ])
      expect(
        evaluateCondition(cacheExpression, { ...coldHosted, ...override }),
        JSON.stringify(override)
      ).toBe(false);
    // Only validated merge-group consumers skip the frozen install.
    const install = actionStep('Install dependencies');
    expect(evaluateCondition(install.if, coldHosted)).toBe(true);
    expect(
      evaluateCondition(install.if, {
        ...coldHosted,
        'github.event_name': 'merge_group',
        'inputs.reuse_merge_group_workspace': 'true',
      })
    ).toBe(false);
  });

  it('saves the installed tree last, only from trusted same-repository refs', () => {
    const save = actionStep('Save installed node_modules (GitHub-hosted)');
    expect(actionSteps.at(-1)).toBe(save);
    expect(stepIndex('Install dependencies')).toBeLessThan(
      stepIndex('Save installed node_modules (GitHub-hosted)')
    );
    expect(save.uses).toBe(
      'actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'
    );
    expect(save.with?.path).toBe(
      actionStep('Restore installed node_modules (GitHub-hosted)').with?.path
    );
    expect(save.with?.key).toBe(
      '${{ steps.node-modules-cache.outputs.cache-primary-key }}'
    );
    const trusted: Record<string, string>[] = [
      { 'github.event_name': 'push' },
      { 'github.event_name': 'pull_request' },
      {
        'github.event_name': 'merge_group',
        'inputs.save_merge_group_workspace': 'true',
      },
    ];
    const untrusted: Record<string, string>[] = [
      {
        'github.event_name': 'pull_request',
        'github.event.pull_request.head.repo.full_name': 'fork/Jovie',
      },
      { 'github.event_name': 'pull_request_target' },
      { 'github.event_name': 'workflow_run' },
      { 'github.event_name': 'merge_group' },
      { 'steps.node-modules-cache.outputs.cache-hit': 'true' },
      { 'steps.node-modules-cache.outcome': 'skipped' },
    ];
    for (const scenario of trusted)
      expect(
        evaluateCondition(save.if, { ...coldHosted, ...scenario }),
        JSON.stringify(scenario)
      ).toBe(true);
    for (const scenario of untrusted)
      expect(
        evaluateCondition(save.if, { ...coldHosted, ...scenario }),
        JSON.stringify(scenario)
      ).toBe(false);
    // The prune runs on exactly the saves that happen, Linux only.
    const prune = actionStep('Drop unloadable binaries before save');
    expect(stepIndex('Drop unloadable binaries before save')).toBeLessThan(
      stepIndex('Save installed node_modules (GitHub-hosted)')
    );
    for (const scenario of [...trusted, ...untrusted])
      expect(
        evaluateCondition(prune.if, { ...coldHosted, ...scenario }),
        JSON.stringify(scenario)
      ).toBe(evaluateCondition(save.if, { ...coldHosted, ...scenario }));
    expect(
      evaluateCondition(prune.if, { ...coldHosted, 'runner.os': 'macOS' })
    ).toBe(false);
  });

  it('hollows only unloadable native payloads before a save', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'jovie-prune-'));
    pruneRoots.push(root);
    const store = resolve(root, 'node_modules/.pnpm');
    const pkg = (dir: string, files: string[]) => {
      for (const file of ['package.json', ...files]) {
        const path = resolve(store, dir, 'node_modules', file);
        mkdirSync(resolve(path, '..'), { recursive: true });
        writeFileSync(path, file);
      }
    };
    pkg('app-builder-bin@5.0.0', [
      'app-builder-bin/mac/app-builder',
      'app-builder-bin/win/app-builder.exe',
      'app-builder-bin/linux/x64/app-builder',
    ]);
    pkg('@img+sharp-linuxmusl-x64@0.34.0', ['@img/sharp/lib/sharp.node']);
    pkg('@rollup+rollup-linux-x64-musl@4.0.0', ['rollup.node']);
    pkg('onnxruntime-node@1.20.0', ['onnxruntime-node/bin/runtime.node']);
    pkg('onnxruntime-common@1.20.0', ['onnxruntime-common/dist/index.js']);
    pkg('@openai+codex@0.1.0-linux-x64', ['codex/bin/codex']);
    pkg('@openai+codex-sdk@0.1.0', ['codex-sdk/dist/index.js']);
    pkg('@anthropic-ai+claude-agent-sdk-linux-x64@1.0.0', ['claude/cli']);
    pkg('@anthropic-ai+claude-agent-sdk@1.0.0', ['sdk/dist/index.js']);
    pkg('@rollup+rollup-linux-x64-gnu@4.0.0', ['rollup.node']);
    const result = spawnSync(
      'bash',
      ['-c', String(actionStep('Drop unloadable binaries before save').run)],
      { cwd: root, encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    const kept = (dir: string, file: string) =>
      existsSync(resolve(store, dir, 'node_modules', file));
    expect(
      kept('app-builder-bin@5.0.0', 'app-builder-bin/mac/app-builder')
    ).toBe(false);
    expect(
      kept('app-builder-bin@5.0.0', 'app-builder-bin/win/app-builder.exe')
    ).toBe(false);
    expect(
      kept('app-builder-bin@5.0.0', 'app-builder-bin/linux/x64/app-builder')
    ).toBe(true);
    for (const [dir, file] of [
      ['@img+sharp-linuxmusl-x64@0.34.0', '@img/sharp/lib/sharp.node'],
      ['@rollup+rollup-linux-x64-musl@4.0.0', 'rollup.node'],
      ['onnxruntime-node@1.20.0', 'onnxruntime-node/bin/runtime.node'],
      ['@openai+codex@0.1.0-linux-x64', 'codex/bin/codex'],
      ['@anthropic-ai+claude-agent-sdk-linux-x64@1.0.0', 'claude/cli'],
    ] as const) {
      expect(kept(dir, file), dir).toBe(false);
      // package.json stays so a frozen install keeps them linked.
      expect(kept(dir, 'package.json'), dir).toBe(true);
    }
    for (const [dir, file] of [
      ['onnxruntime-common@1.20.0', 'onnxruntime-common/dist/index.js'],
      ['@openai+codex-sdk@0.1.0', 'codex-sdk/dist/index.js'],
      ['@anthropic-ai+claude-agent-sdk@1.0.0', 'sdk/dist/index.js'],
      ['@rollup+rollup-linux-x64-gnu@4.0.0', 'rollup.node'],
    ] as const)
      expect(kept(dir, file), dir).toBe(true);
  });

  it('skips non-bundled onnxruntime downloads in both install phases', () => {
    expect(
      actionSteps
        .filter(step => step.env?.ONNXRUNTIME_NODE_INSTALL === 'skip')
        .map(step => step.name)
    ).toEqual(['Warm pnpm store', 'Install dependencies']);
  });

  it('disables package cache teardown only for the exact Mac product lane', () => {
    expect(setupAction.inputs.package_cache?.default).toBe('true');
    const ci = parseYaml(
      readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8')
    ) as {
      jobs: Record<string, { needs?: string[]; steps?: ActionStep[] }>;
    };
    const disabled = Object.entries(ci.jobs).flatMap(([id, job]) =>
      (job.steps ?? [])
        .filter(
          step =>
            step.uses === './.github/actions/setup-node-pnpm' &&
            String(step.with?.package_cache) === 'false'
        )
        .map(() => id)
    );
    expect(disabled).toEqual(['ci-macos']);
    expect(ci.jobs['ci-cross-product-integration']?.needs).toContain(
      'ci-macos'
    );
    expect(ci.jobs['ci-product-lane-receipt']?.needs).toContain(
      'ci-cross-product-integration'
    );
  });
});

describe('full browser matrix setup routing', () => {
  const matrixWorkflow = parseYaml(
    readFileSync(
      resolve(repoRoot, '.github/workflows/e2e-full-matrix.yml'),
      'utf8'
    )
  ) as {
    jobs: Record<
      string,
      {
        strategy?: { 'max-parallel'?: number; matrix?: { browser?: string[] } };
        env?: Record<string, string>;
        steps: ActionStep[];
      }
    >;
  };
  const matrixJob = matrixWorkflow.jobs['e2e-full-matrix'];
  const setupSteps = (matrixJob?.steps ?? []).filter(step =>
    /(?:Cache|Install|Setup) Playwright/.test(step.name ?? '')
  );
  const forBrowser = (browser: string) =>
    setupSteps.filter(step =>
      evaluateCondition(step.if, { 'matrix.browser': browser })
    );

  it('routes Chromium exclusively through the shared apt-free setup action', () => {
    const chromium = forBrowser('chromium');
    expect(chromium.map(step => step.uses)).toEqual([
      './.github/actions/setup-playwright',
    ]);
    expect(chromium[0]?.run).toBeUndefined();
  });

  it('keeps the browser cache and dependency installer Firefox-only', () => {
    const [cache, install, ...rest] = forBrowser('firefox');
    expect(rest).toEqual([]);
    expect(cache?.with?.path).toBe('~/.cache/ms-playwright');
    expect(String(cache?.with?.key)).toMatch(
      /^\$\{\{ runner\.os \}\}-playwright-\$\{\{ matrix\.browser \}\}-/
    );
    expect(install?.run).toContain(
      'playwright install chromium ${{ matrix.browser }} --with-deps'
    );
  });

  it('serializes the matrix and never skips browser host validation', () => {
    expect(matrixJob?.strategy?.matrix?.browser).toEqual([
      'chromium',
      'firefox',
    ]);
    expect(matrixJob?.strategy?.['max-parallel']).toBe(1);
    // Four workers starve the hosted runner ("lost communication", JOV-7677).
    expect(matrixJob?.env?.PLAYWRIGHT_WORKERS).toBe('2');
    const playwrightAction = parseYaml(
      readFileSync(
        resolve(repoRoot, '.github/actions/setup-playwright/action.yml'),
        'utf8'
      )
    ) as { runs: { steps: ActionStep[] } };
    const runs = playwrightAction.runs.steps.map(step => step.run ?? '');
    expect(runs[0]).toContain(
      'verify-prerequisites.mjs --component playwright'
    );
    expect(runs).toContain(
      'pnpm --filter=@jovie/web exec playwright install chromium'
    );
    expect(JSON.stringify([matrixWorkflow, playwrightAction])).not.toContain(
      'PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS'
    );
  });
});

describe('baked runner prerequisite contract', () => {
  const temporaryDirectories: string[] = [];
  const verifierPath = resolve(
    repoRoot,
    '.github/runner-image/verify-prerequisites.mjs'
  );
  const verifier = readFileSync(verifierPath, 'utf8');
  const requirements = JSON.parse(
    readFileSync(
      resolve(repoRoot, '.github/runner-image/prerequisites.json'),
      'utf8'
    )
  ) as {
    readonly nodeMajor: number;
    readonly nodeMinimum: string;
    readonly pnpmVersion: string;
    readonly playwrightVersion: string;
    readonly playwrightExecutables: readonly string[];
    readonly pnpmStorePath: string;
    readonly installedTreeRoot: string;
    readonly playwrightBrowsersPath: string;
  };
  const playwrightAction = readFileSync(
    resolve(repoRoot, '.github/actions/setup-playwright/action.yml'),
    'utf8'
  );
  const runnerDockerfile = readFileSync(
    resolve(repoRoot, '.github/runner-image/Dockerfile'),
    'utf8'
  );
  const runnerDockerignore = readFileSync(
    resolve(repoRoot, '.github/runner-image/Dockerfile.dockerignore'),
    'utf8'
  );
  const runnerBuildContextScript = resolve(
    repoRoot,
    '.github/runner-image/build-context.sh'
  );
  const createInstalledTreeScript = resolve(
    repoRoot,
    '.github/runner-image/create-installed-tree.mjs'
  );
  const restoreInstalledTreeScript = resolve(
    repoRoot,
    '.github/runner-image/restore-installed-tree.sh'
  );
  const createInstalledTree = readFileSync(createInstalledTreeScript, 'utf8');
  const restoreInstalledTree = readFileSync(restoreInstalledTreeScript, 'utf8');
  const ciWorkflow = readFileSync(
    resolve(repoRoot, '.github/workflows/ci.yml'),
    'utf8'
  );
  const runnerImageOfflineProofStart = ciWorkflow.indexOf(
    '  runner-image-offline-proof:'
  );
  const runnerImageOfflineProof = ciWorkflow.slice(
    runnerImageOfflineProofStart,
    ciWorkflow.indexOf('  runner-image-canary:', runnerImageOfflineProofStart)
  );
  const runnerImageCanaryStart = ciWorkflow.indexOf('  runner-image-canary:');
  const runnerImageCanary = ciWorkflow.slice(
    runnerImageCanaryStart,
    ciWorkflow.indexOf('  main-queue-provenance:', runnerImageCanaryStart)
  );
  const patchedDependencyPaths = [
    ...(
      readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'), 'utf8')
        .split('\nimporters:\n')[0]
        ?.split('\npatchedDependencies:\n')[1] ?? ''
    ).matchAll(/^ {4}path: (.+)$/gm),
  ].map(match => match[1]);

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function makeFixture() {
    const directory = mkdtempSync(resolve(tmpdir(), 'jovie-runner-prereqs-'));
    temporaryDirectories.push(directory);
    const storePath = resolve(directory, 'pnpm-store');
    const installedTreeRoot = resolve(directory, 'installed-tree');
    const browsersPath = resolve(directory, 'ms-playwright');
    mkdirSync(storePath);
    mkdirSync(installedTreeRoot);
    const lockSha = createHash('sha256')
      .update(readFileSync(resolve(repoRoot, 'pnpm-lock.yaml')))
      .digest('hex');
    const installedTreeArchivePath = resolve(
      installedTreeRoot,
      `${lockSha}.tar`
    );
    writeFileSync(installedTreeArchivePath, 'fixture installed tree');
    const installedTreeArchiveSha = createHash('sha256')
      .update(readFileSync(installedTreeArchivePath))
      .digest('hex');
    writeFileSync(
      `${installedTreeArchivePath}.sha256`,
      `${installedTreeArchiveSha}  ${installedTreeArchivePath}\n`
    );
    for (const executable of requirements.playwrightExecutables) {
      const executablePath = resolve(browsersPath, executable);
      mkdirSync(resolve(executablePath, '..'), { recursive: true });
      writeFileSync(executablePath, '#!/bin/sh\n', { mode: 0o755 });
    }
    const fixtureRequirementsPath = resolve(directory, 'requirements.json');
    // Exercise marker behavior on the runtime under test. The separate pin
    // contract still validates the production image requirements unchanged.
    const fixtureRequirements = {
      ...requirements,
      nodeMajor: Number(process.versions.node.split('.')[0]),
      nodeMinimum: process.versions.node,
      pnpmStorePath: storePath,
      installedTreeRoot,
      playwrightBrowsersPath: browsersPath,
    };
    writeFileSync(fixtureRequirementsPath, JSON.stringify(fixtureRequirements));
    // Real `pnpm --version` costs ~600ms per verifier run. Marker cases prove
    // marker logic, so they probe a pinned shim; one case keeps the host pnpm.
    const pnpmShimDirectory = resolve(directory, 'pnpm-shim');
    mkdirSync(pnpmShimDirectory);
    const setPnpmShimVersion = (version: string) =>
      writeFileSync(
        resolve(pnpmShimDirectory, 'pnpm'),
        `#!/bin/sh\necho ${version}\n`,
        { mode: 0o755 }
      );
    setPnpmShimVersion(fixtureRequirements.pnpmVersion);
    return {
      browsersPath,
      pnpmShimDirectory,
      setPnpmShimVersion,
      installedTreeArchivePath,
      markerPath: resolve(directory, 'manifest.json'),
      requirementsPath: fixtureRequirementsPath,
      requirements: fixtureRequirements,
    };
  }

  function verifierEnvironment(
    fixture: ReturnType<typeof makeFixture>,
    environment: NodeJS.ProcessEnv = process.env,
    { hostPnpm = false }: { readonly hostPnpm?: boolean } = {}
  ) {
    const { GITHUB_OUTPUT: _githubOutput, ...environmentWithoutGithubOutput } =
      environment;
    return {
      ...environmentWithoutGithubOutput,
      PATH: hostPnpm
        ? environment.PATH
        : `${fixture.pnpmShimDirectory}${delimiter}${environment.PATH ?? ''}`,
      JOVIE_RUNNER_PREREQUISITES_MARKER: fixture.markerPath,
      JOVIE_RUNNER_REQUIREMENTS_PATH: fixture.requirementsPath,
      JOVIE_RUNNER_REPO_ROOT: repoRoot,
    };
  }

  it('pins the repo toolchain and Playwright browser revisions', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
    ) as {
      readonly packageManager: string;
      readonly engines: { readonly pnpm: string };
      readonly devDependencies: Readonly<Record<string, string>>;
    };
    expect(requirements.nodeMajor).toBe(24);
    expect(requirements.nodeMinimum).toBe('24.21.0');
    expect(requirements.nodeMinimum).toBe(
      readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim()
    );
    expect(`pnpm@${requirements.pnpmVersion}`).toBe(packageJson.packageManager);
    // JOV-6603: Vercel resolves a newer pnpm 9.15 patch than an exact engines pin.
    expect(packageJson.engines.pnpm).toBe('>=9.15.4 <10');
    expect(requirements.playwrightVersion).toBe(
      packageJson.devDependencies.playwright
    );
    expect(requirements.playwrightExecutables).toEqual([
      'chromium-1223/chrome-linux64/chrome',
      'chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',
      'ffmpeg-1011/ffmpeg-linux',
    ]);
  });

  it('pins the amd64 base image and verifies the Node archive checksum', () => {
    expect(runnerDockerfile).toContain(
      'sha256:f546db5932b903c81cf269a712dad679fdf139dc08b7676c08f391a11258de5e'
    );
    expect(runnerDockerfile).toContain(
      'fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6'
    );
    expect(runnerDockerfile).toContain('sha256sum --check --strict');
    expect(runnerDockerfile).not.toMatch(/curl[\s\S]*?\|\s*tar/);
    expect(runnerDockerfile).toContain(
      'corepack install --global "pnpm@${PNPM_VERSION}"'
    );
    expect(runnerDockerfile).toContain('COREPACK_HOME=/opt/corepack');
    expect(runnerDockerfile).toContain('su -s /bin/bash runner -c');
    expect(runnerDockerfile).toContain(
      '/opt/hostedtoolcache/node/24.21.0/x64/bin/pnpm --version'
    );
    expect(
      runnerDockerfile.indexOf('FROM runner-base\n\n# Corepack')
    ).toBeLessThan(runnerDockerfile.indexOf('COPY --from=prerequisites'));
    expect(runnerDockerfile.indexOf('USER runner')).toBeLessThan(
      runnerDockerfile.lastIndexOf(
        'cd / && COREPACK_ENABLE_NETWORK=0 pnpm --version'
      )
    );
    expect(runnerDockerfile).not.toContain('corepack prepare');
  });

  it('bounds the Docker context to manifests and runner contract files', () => {
    const ignoreLines = new Set(runnerDockerignore.split('\n'));
    expect(runnerDockerignore.startsWith('**\n')).toBe(true);
    for (const included of [
      '!package.json',
      '!pnpm-lock.yaml',
      '!pnpm-workspace.yaml',
      '!patches/**',
      '!apps/*/package.json',
      '!packages/*/package.json',
      '!workers/*/package.json',
      '!.github/runner-image/prerequisites.json',
      '!.github/runner-image/create-installed-tree.mjs',
      '!.github/runner-image/restore-installed-tree.sh',
      '!.github/runner-image/verify-prerequisites.mjs',
    ]) {
      expect(runnerDockerignore).toContain(included);
    }
    for (const excluded of [
      '.git',
      'node_modules',
      '.env',
      'test-results',
      'screenshots',
    ]) {
      expect(ignoreLines.has(`!${excluded}`)).toBe(false);
    }
    expect(patchedDependencyPaths.length).toBeGreaterThan(0);
    for (const patchPath of patchedDependencyPaths) {
      expect(patchPath).toMatch(/^patches\/.+\.patch$/);
      expect(patchPath.split('/')).not.toContain('..');
      expect(runnerDockerignore).toContain('!patches/**');
      expect(runnerDockerfile).toContain('COPY patches patches');
    }
  });

  it('builds a deterministic filtered context before a streamed Docker build', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'jovie-build-context-'));
    temporaryDirectories.push(directory);
    const gitBinDirectory = resolve(directory, 'bin');
    const gitWrapper = resolve(gitBinDirectory, 'git');
    const catFileCount = resolve(directory, 'cat-file-count');
    const gitExecutable = execFileSync('sh', ['-c', 'command -v git'], {
      encoding: 'utf8',
    }).trim();
    mkdirSync(gitBinDirectory);
    writeFileSync(
      gitWrapper,
      '#!/usr/bin/env bash\nset -euo pipefail\nif [[ "${1:-}" == "cat-file" ]]; then\n  printf \'1\\n\' >> "${GIT_CAT_FILE_COUNT}"\nfi\nexec "${REAL_GIT}" "$@"\n'
    );
    chmodSync(gitWrapper, 0o755);
    const buildTree = execFileSync('git', ['write-tree'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    expect(buildTree).toMatch(/^[0-9a-f]{40}$/);
    const listedPaths = execFileSync(
      'bash',
      [runnerBuildContextScript, buildTree, '--list'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_CAT_FILE_COUNT: catFileCount,
          PATH: `${gitBinDirectory}:${process.env.PATH ?? ''}`,
          REAL_GIT: gitExecutable,
        },
      }
    )
      .trim()
      .split('\n');
    expect(readFileSync(catFileCount, 'utf8').trim().split('\n')).toHaveLength(
      1
    );
    const firstArchive = execFileSync(
      'bash',
      [runnerBuildContextScript, buildTree],
      {
        cwd: repoRoot,
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    const secondArchive = execFileSync(
      'bash',
      [runnerBuildContextScript, buildTree],
      {
        cwd: repoRoot,
        maxBuffer: 20 * 1024 * 1024,
      }
    );

    expect(firstArchive.equals(secondArchive)).toBe(true);
    expect(listedPaths).toContain('.github/runner-image/Dockerfile');
    expect(listedPaths).toContain(
      '.github/runner-image/create-installed-tree.mjs'
    );
    expect(listedPaths).toContain(
      '.github/runner-image/restore-installed-tree.sh'
    );
    expect(listedPaths).toContain('apps/web/package.json');
    expect(listedPaths).not.toContain(
      'apps/web/tests/unit/ci/runner-setup-action.test.ts'
    );
    for (const patchPath of patchedDependencyPaths) {
      expect(listedPaths).toContain(patchPath);
    }
  }, 60_000);

  it('fails closed when a required filtered-context entry is missing', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'jovie-build-context-'));
    temporaryDirectories.push(directory);
    const environment = {
      ...process.env,
      GIT_INDEX_FILE: resolve(directory, 'index'),
    };
    execFileSync('git', ['read-tree', 'HEAD'], {
      cwd: repoRoot,
      env: environment,
    });
    execFileSync('git', ['rm', '--cached', '--quiet', '.npmrc'], {
      cwd: repoRoot,
      env: environment,
    });
    const missingTree = execFileSync('git', ['write-tree'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: environment,
    }).trim();

    const result = spawnSync(
      'bash',
      [runnerBuildContextScript, missingTree, '--list'],
      { cwd: repoRoot, encoding: 'utf8' }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'runner build context contains a missing tree entry:'
    );
    expect(result.stderr).toContain('.npmrc');
  });

  it('dispatches an exact-SHA canary only to the dedicated image label', () => {
    expect(runnerImageCanaryStart).toBeGreaterThan(-1);
    expect(runnerImageCanary).toContain(
      "github.event_name == 'workflow_dispatch'"
    );
    expect(runnerImageCanary).toContain(
      'inputs.run_runner_image_canary == true'
    );
    expect(runnerImageCanary).toContain('ref: ${{ github.sha }}');
    expect(runnerImageCanary).not.toContain('github.event.pull_request');
    expect(runnerImageCanary).toContain(
      `runs-on: [self-hosted, Linux, X64, "\${{ 'jovie-runner-image-canary' }}"]`
    );
    expect(runnerImageCanary).toContain('needs: runner-image-offline-proof');
    expect(runnerImageCanary).not.toContain('jovie-ephemeral');
    expect(runnerImageCanary).not.toContain('jovie-fixed');
    expect(runnerImageCanary).toContain(
      'uses: ./.github/actions/setup-node-pnpm'
    );
    expect(runnerImageCanary).toContain(
      'uses: ./.github/actions/setup-playwright'
    );
    expect(runnerImageCanary).toContain('dependencies_warm=true');
    expect(runnerImageCanary).toContain('playwright_warm=true');
    expect(runnerImageCanary).toContain(
      'dependency_status=$(env -u GITHUB_OUTPUT node .github/runner-image/verify-prerequisites.mjs --component dependencies)'
    );
    expect(runnerImageCanary).toContain(
      'playwright_status=$(env -u GITHUB_OUTPUT node .github/runner-image/verify-prerequisites.mjs --component playwright)'
    );
    expect(runnerImageCanary).toContain(
      "assert_line 'dependency warm status' 'dependencies_warm=true'"
    );
    expect(runnerImageCanary).toContain(
      "assert_executable 'Chromium headless shell'"
    );
    expect(runnerImageCanary).toContain(
      'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"'
    );
  });

  it('proves the exact runner image cache and restore path offline on hosted CI', () => {
    expect(runnerImageOfflineProofStart).toBeGreaterThan(-1);
    expect(runnerImageOfflineProof).toContain('runs-on: ubuntu-24.04');
    expect(runnerImageOfflineProof).toContain(
      "github.event_name == 'workflow_dispatch'"
    );
    expect(runnerImageOfflineProof).toContain(
      'inputs.run_runner_image_canary == true'
    );
    expect(runnerImageOfflineProof).not.toContain('github.event.pull_request');
    expect(runnerImageOfflineProof).toContain(
      '.github/runner-image/build-context.sh "$EXPECTED_SHA"'
    );
    expect(runnerImageOfflineProof).toContain(
      'uses: crazy-max/ghaction-github-runtime@04d248b84655b509d8c44dc1d6f990c879747487'
    );
    expect(runnerImageOfflineProof).toContain(
      "runner-image-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-"
    );
    expect(runnerImageOfflineProof).toContain(
      '--cache-from "type=gha,scope=$CACHE_SCOPE,version=2"'
    );
    expect(runnerImageOfflineProof).toContain(
      '--cache-to "type=gha,scope=$CACHE_SCOPE,mode=max,version=2"'
    );
    expect(runnerImageOfflineProof).toContain(
      "CACHE_SCOPE: runner-image-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ steps.runner-context.outputs.sha256 }}"
    );
    expect(runnerImageOfflineProof).toContain(
      'node .github/runner-image/verify-build-cache.mjs'
    );
    expect(runnerImageOfflineProof).toContain('--network none');
    expect(runnerImageOfflineProof).toContain(
      '/repo/.github/runner-image/restore-installed-tree.sh'
    );
    expect(runnerImageOfflineProof).toContain(
      'runner-image-evidence/second-build-metadata.json'
    );
    expect(runnerImageOfflineProof).toContain(
      'runner-image-evidence/cache-proof.json'
    );
    expect(runnerImageOfflineProof).toContain(
      'name: runner-image-proof-${{ github.sha }}'
    );
    expect(runnerImageOfflineProof).toContain(
      'rm -f runner-image-evidence/context.tar'
    );
    expect(runnerImageOfflineProof).toContain('evidence_kb > 2048');
    expect(runnerImageOfflineProof).not.toContain('type=local');
    expect(runnerImageOfflineProof).not.toContain(
      '/tmp/jovie-runner-buildx-cache'
    );
    expect(runnerImageOfflineProof).not.toContain('jovie-ephemeral');
    expect(runnerImageOfflineProof).not.toContain('jovie-fixed');
    expect(runnerImageOfflineProof).not.toContain('jovie-runner:latest');
  });

  it('fails closed when the second image build does not prove a cached dependency layer', () => {
    const verifier = resolve(
      repoRoot,
      '.github/runner-image/verify-build-cache.mjs'
    );
    const directory = mkdtempSync(resolve(tmpdir(), 'jovie-build-cache-'));
    temporaryDirectories.push(directory);
    const validLog = resolve(directory, 'valid.log');
    writeFileSync(
      validLog,
      [
        '#3 importing cache manifest from gha:runner-image-lock',
        '#12 [prerequisites 7/10] RUN pnpm config set store-dir /opt/jovie-pnpm-store && pnpm fetch --frozen-lockfile',
        '#12 CACHED',
      ].join('\n')
    );
    const summaryPath = resolve(directory, 'cache-proof.json');
    expect(
      JSON.parse(
        execFileSync(process.execPath, [verifier, validLog, summaryPath], {
          encoding: 'utf8',
        })
      )
    ).toMatchObject({
      cacheBackend: 'github-actions-buildkit-v2',
      dependencyLayerCached: true,
      dependencyDownloadOutput: false,
    });
    expect(JSON.parse(readFileSync(summaryPath, 'utf8'))).toMatchObject({
      dependencyLayerCached: true,
      dependencyDownloadOutput: false,
    });

    const uncachedLog = resolve(directory, 'uncached.log');
    writeFileSync(
      uncachedLog,
      [
        '#3 importing cache manifest from gha:runner-image-lock',
        '#12 [prerequisites 7/10] RUN pnpm config set store-dir /opt/jovie-pnpm-store && pnpm fetch --frozen-lockfile',
        '#12 0.123 Progress: resolved 100, downloaded 100',
        '#12 DONE 3.4s',
      ].join('\n')
    );
    const uncached = spawnSync(process.execPath, [verifier, uncachedLog], {
      encoding: 'utf8',
    });
    expect(uncached.status).toBe(1);
    expect(uncached.stderr).toContain('was not restored from cache');

    const missingManifestLog = resolve(directory, 'missing-manifest.log');
    writeFileSync(
      missingManifestLog,
      [
        '#12 [prerequisites 7/10] RUN pnpm config set store-dir /opt/jovie-pnpm-store && pnpm fetch --frozen-lockfile',
        '#12 CACHED',
      ].join('\n')
    );
    const missingManifest = spawnSync(
      process.execPath,
      [verifier, missingManifestLog],
      { encoding: 'utf8' }
    );
    expect(missingManifest.status).toBe(1);
    expect(missingManifest.stderr).toContain(
      'did not import the persisted BuildKit cache manifest'
    );

    const contradictoryLog = resolve(directory, 'contradictory.log');
    writeFileSync(
      contradictoryLog,
      [
        '#3 importing cache manifest from gha:runner-image-lock',
        '#12 [prerequisites 7/10] RUN pnpm config set store-dir /opt/jovie-pnpm-store && pnpm fetch --frozen-lockfile',
        '#12 0.123 Progress: resolved 100, downloaded 100',
        '#12 CACHED',
      ].join('\n')
    );
    const contradictory = spawnSync(
      process.execPath,
      [verifier, contradictoryLog],
      { encoding: 'utf8' }
    );
    expect(contradictory.status).toBe(1);
    expect(contradictory.stderr).toContain(
      'emitted execution/download output despite its cache claim'
    );
  });

  it('keeps runner contract edits outside the expensive dependency layer', () => {
    const dependencyLayer = runnerDockerfile.indexOf(
      'RUN pnpm config set store-dir /opt/jovie-pnpm-store'
    );
    const requirementsCopy = runnerDockerfile.indexOf(
      'COPY .github/runner-image/prerequisites.json'
    );
    const verifierCopy = runnerDockerfile.indexOf(
      'COPY .github/runner-image/verify-prerequisites.mjs'
    );

    expect(dependencyLayer).toBeGreaterThan(-1);
    expect(runnerDockerfile).toContain('COPY patches patches');
    expect(runnerDockerfile.indexOf('COPY patches patches')).toBeLessThan(
      dependencyLayer
    );
    expect(requirementsCopy).toBeGreaterThan(dependencyLayer);
    expect(verifierCopy).toBeGreaterThan(dependencyLayer);
    expect(runnerDockerfile).not.toContain('COPY . .');
  });

  it('fails closed only for malformed image markers', () => {
    expect(verifier).toContain('Runner image prerequisite drift detected');
    expect(verifier).toContain('lockfileSha256');
    expect(verifier).toContain('missing baked path');
    expect(verifier).toContain('invalid schema');
    expect(verifier).toContain('Cannot mark an incomplete runner image');
    expect(verifier).toContain('statSync(executablePath).mode & 0o111');
  });

  it('rejects installed-tree symlinks that escape the checkout', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'jovie-tree-escape-'));
    temporaryDirectories.push(directory);
    for (const scope of ['apps', 'packages', 'workers', 'node_modules']) {
      mkdirSync(resolve(directory, scope));
    }
    writeFileSync(resolve(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    symlinkSync('../../outside', resolve(directory, 'node_modules', 'escape'));

    const result = spawnSync(
      process.execPath,
      [createInstalledTreeScript, directory, resolve(directory, 'archives')],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('symlink escapes the repo');
  });

  it('restores only an integrity-checked tree into a fresh checkout', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'jovie-tree-restore-'));
    temporaryDirectories.push(directory);
    const source = resolve(directory, 'source');
    const workspace = resolve(directory, 'workspace');
    mkdirSync(resolve(source, 'node_modules', '.bin'), { recursive: true });
    mkdirSync(resolve(source, 'apps', 'web', 'node_modules'), {
      recursive: true,
    });
    mkdirSync(workspace);
    writeFileSync(
      resolve(source, 'node_modules', '.modules.yaml'),
      'storeDir: /opt/store\n'
    );
    writeFileSync(
      resolve(source, 'node_modules', '.bin', 'tsx'),
      '#!/bin/sh\n',
      {
        mode: 0o755,
      }
    );
    writeFileSync(
      resolve(source, 'apps', 'web', 'node_modules', 'next'),
      'fixture\n'
    );
    const archive = resolve(directory, 'installed-tree.tar');
    execFileSync('tar', ['-cf', archive, '-C', source, 'node_modules', 'apps']);
    const archiveSha = createHash('sha256')
      .update(readFileSync(archive))
      .digest('hex');

    const restored = spawnSync(
      'bash',
      [restoreInstalledTreeScript, archive, archiveSha],
      { encoding: 'utf8', env: { ...process.env, GITHUB_WORKSPACE: workspace } }
    );
    expect(restored.status).toBe(0);
    expect(
      readFileSync(resolve(workspace, 'apps/web/node_modules/next'), 'utf8')
    ).toBe('fixture\n');

    const duplicate = spawnSync(
      'bash',
      [restoreInstalledTreeScript, archive, archiveSha],
      { encoding: 'utf8', env: { ...process.env, GITHUB_WORKSPACE: workspace } }
    );
    expect(duplicate.status).toBe(1);
    expect(duplicate.stderr).toContain('existing node_modules');

    const corruptWorkspace = resolve(directory, 'corrupt-workspace');
    mkdirSync(corruptWorkspace);
    const corrupt = spawnSync(
      'bash',
      [restoreInstalledTreeScript, archive, '0'.repeat(64)],
      {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_WORKSPACE: corruptWorkspace },
      }
    );
    expect(corrupt.status).toBe(1);
    expect(corrupt.stdout).toContain('FAILED');
  });

  it('uses a portable SHA-256 implementation for local and Linux verification', () => {
    expect(createInstalledTree).toContain("['sha256sum', [path]]");
    expect(createInstalledTree).toContain("['shasum', ['-a', '256', path]]");
    expect(restoreInstalledTree).toContain('command -v sha256sum');
    expect(restoreInstalledTree).toContain('command -v shasum');
    expect(restoreInstalledTree).toContain('actual_sha=$(sha256_file');
  });

  it('falls back only when the image has no marker', () => {
    const fixture = makeFixture();
    const output = execFileSync(
      process.execPath,
      [verifierPath, '--component', 'dependencies'],
      { encoding: 'utf8', env: verifierEnvironment(fixture) }
    );

    expect(output).toContain('dependencies_warm=false');
    expect(output).toContain('using cold setup');
  });

  it('captures machine output on stdout inside a GitHub Actions process', () => {
    const fixture = makeFixture();
    const githubOutputPath = resolve(fixture.markerPath, '..', 'github-output');
    const output = execFileSync(
      process.execPath,
      [verifierPath, '--component', 'dependencies'],
      {
        encoding: 'utf8',
        env: verifierEnvironment(fixture, {
          ...process.env,
          GITHUB_OUTPUT: githubOutputPath,
        }),
      }
    );

    expect(output).toContain('dependencies_warm=false');
    expect(existsSync(githubOutputPath)).toBe(false);
  });

  it('accepts a complete exact marker and falls back on lockfile drift', () => {
    const fixture = makeFixture();
    const env = verifierEnvironment(fixture);
    execFileSync(
      process.execPath,
      [verifierPath, '--write-marker', fixture.markerPath],
      { env }
    );

    const dependencies = execFileSync(
      process.execPath,
      [verifierPath, '--component', 'dependencies'],
      { encoding: 'utf8', env }
    );
    const playwright = execFileSync(
      process.execPath,
      [verifierPath, '--component', 'playwright'],
      { encoding: 'utf8', env }
    );
    expect(dependencies).toContain('dependencies_warm=true');
    expect(playwright).toContain('playwright_warm=true');

    const marker = JSON.parse(readFileSync(fixture.markerPath, 'utf8')) as {
      readonly lockfileSha256: string;
    };
    writeFileSync(
      fixture.markerPath,
      JSON.stringify({ ...marker, lockfileSha256: 'stale' })
    );

    const drifted = spawnSync(
      process.execPath,
      [verifierPath, '--component', 'dependencies'],
      { encoding: 'utf8', env }
    );
    expect(drifted.status).toBe(0);
    expect(drifted.stdout).toContain('dependencies_warm=false');
    expect(drifted.stderr).toContain('lockfileSha256');
    expect(drifted.stderr).toContain('got "stale"');
  }, 15_000);

  it('binds the marker to the pnpm version reported by the host binary', () => {
    const fixture = makeFixture();
    const env = verifierEnvironment(fixture, process.env, { hostPnpm: true });
    // Like nodeMajor/nodeMinimum in makeFixture, require the runtime under
    // test: the verifier fails closed on pnpm drift (covered by the drift test
    // below), and this case proves the marker records the host binary's own
    // report on any host, not only one that happens to match the image pin.
    const hostPnpmVersion = execFileSync('pnpm', ['--version'], {
      encoding: 'utf8',
      env,
    }).trim();
    writeFileSync(
      fixture.requirementsPath,
      JSON.stringify({ ...fixture.requirements, pnpmVersion: hostPnpmVersion })
    );
    execFileSync(
      process.execPath,
      [verifierPath, '--write-marker', fixture.markerPath],
      { env }
    );
    const marker = JSON.parse(readFileSync(fixture.markerPath, 'utf8')) as {
      readonly pnpmVersion: string;
    };
    expect(marker.pnpmVersion).toBe(hostPnpmVersion);
  }, 15_000);

  it('falls back on required pnpm version drift', () => {
    const fixture = makeFixture();
    const env = verifierEnvironment(fixture);
    execFileSync(
      process.execPath,
      [verifierPath, '--write-marker', fixture.markerPath],
      { env }
    );

    fixture.setPnpmShimVersion('0.0.0');
    const pnpmDrift = spawnSync(
      process.execPath,
      [verifierPath, '--component', 'dependencies'],
      { encoding: 'utf8', env }
    );
    expect(pnpmDrift.status).toBe(0);
    expect(pnpmDrift.stdout).toContain('dependencies_warm=false');
    expect(pnpmDrift.stderr).toContain(
      `pnpm 0.0.0 does not match required ${requirements.pnpmVersion}`
    );
  });

  it('falls back on required runtime or Playwright version drift', () => {
    const fixture = makeFixture();
    const env = verifierEnvironment(fixture);
    execFileSync(
      process.execPath,
      [verifierPath, '--write-marker', fixture.markerPath],
      { env }
    );

    writeFileSync(
      fixture.requirementsPath,
      JSON.stringify({
        ...fixture.requirements,
        nodeMajor: fixture.requirements.nodeMajor + 1,
      })
    );
    const nodeDrift = spawnSync(
      process.execPath,
      [verifierPath, '--component', 'dependencies'],
      { encoding: 'utf8', env }
    );
    expect(nodeDrift.status).toBe(0);
    expect(nodeDrift.stdout).toContain('dependencies_warm=false');
    expect(nodeDrift.stderr).toContain('does not satisfy');

    writeFileSync(
      fixture.requirementsPath,
      JSON.stringify(fixture.requirements)
    );
    const marker = JSON.parse(readFileSync(fixture.markerPath, 'utf8')) as {
      readonly playwrightVersion: string;
    };
    writeFileSync(
      fixture.markerPath,
      JSON.stringify({ ...marker, playwrightVersion: '0.0.0' })
    );
    const playwrightDrift = spawnSync(
      process.execPath,
      [verifierPath, '--component', 'playwright'],
      { encoding: 'utf8', env }
    );
    expect(playwrightDrift.status).toBe(0);
    expect(playwrightDrift.stdout).toContain('playwright_warm=false');
    expect(playwrightDrift.stderr).toContain('playwrightVersion');
  }, 15_000);

  it('falls back when browser executables are missing', () => {
    const fixture = makeFixture();
    const env = verifierEnvironment(fixture);
    execFileSync(
      process.execPath,
      [verifierPath, '--write-marker', fixture.markerPath],
      { env }
    );
    rmSync(
      resolve(fixture.browsersPath, requirements.playwrightExecutables[0] ?? '')
    );

    const partial = spawnSync(
      process.execPath,
      [verifierPath, '--component', 'playwright'],
      { encoding: 'utf8', env }
    );
    expect(partial.status).toBe(0);
    expect(partial.stdout).toContain('playwright_warm=false');
    expect(partial.stderr).toContain('missing baked path');
    expect(partial.stderr).toContain(requirements.playwrightExecutables[0]);
  }, 15_000);

  it('fails closed for an invalid marker schema', () => {
    const fixture = makeFixture();
    writeFileSync(
      fixture.markerPath,
      JSON.stringify({ schemaVersion: requirements.schemaVersion + 1 })
    );

    const invalid = spawnSync(
      process.execPath,
      [verifierPath, '--component', 'dependencies'],
      { encoding: 'utf8', env: verifierEnvironment(fixture) }
    );
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('invalid schema');
  });

  it('skips Playwright cache and downloads only for an exact warm image', () => {
    expect(playwrightAction).toContain(
      'node .github/runner-image/verify-prerequisites.mjs --component playwright'
    );
    expect(playwrightAction.match(/playwright_warm != 'true'/g)).toHaveLength(
      2
    );
    expect(playwrightAction).toContain('PLAYWRIGHT_BROWSERS_PATH=');
  });
});
