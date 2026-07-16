import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

describe('self-hosted runner setup action', () => {
  const action = readFileSync(
    resolve(repoRoot, '.github/actions/setup-node-pnpm/action.yml'),
    'utf8'
  );

  it('never saves pnpm stores from fixed or ephemeral self-hosted runners', () => {
    expect(action).not.toContain('uses: actions/cache@');
    expect(action).not.toContain('STORE_PATH=');
    expect(action).not.toContain('steps.pnpm-cache.outputs.STORE_PATH');
    expect(action).toContain('run: pnpm fetch --frozen-lockfile');
    expect(action).toContain('pnpm install --frozen-lockfile');
  });

  it('restores an exact baked installed tree and falls back when no marker exists', () => {
    expect(action).toContain(
      'node .github/runner-image/verify-prerequisites.mjs --component dependencies'
    );
    expect(action).toContain(
      "if: steps.runner-prereqs.outputs.dependencies_warm != 'true'"
    );
    expect(action).toContain('.github/runner-image/restore-installed-tree.sh');
    expect(action).toContain('installed_tree_archive_path');
    expect(action).toContain('installed_tree_archive_sha256');
  });

  it('checks the image before and skips both setup actions when warm', () => {
    const verifyIndex = action.indexOf('Verify baked runner prerequisites');
    const pnpmIndex = action.indexOf('- name: Setup pnpm');
    const nodeIndex = action.indexOf('- name: Setup Node.js with pnpm cache');
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeLessThan(pnpmIndex);
    expect(verifyIndex).toBeLessThan(nodeIndex);

    for (const stepName of ['Setup pnpm', 'Setup Node.js with pnpm cache']) {
      const step = action.match(
        new RegExp(
          `- name: ${stepName.replace('.', '\\.')}\\n(?<step>[\\s\\S]*?)(?=\\n    - name:|$)`
        )
      )?.groups?.step;
      expect(step).toContain(
        "if: steps.runner-prereqs.outputs.dependencies_warm != 'true'"
      );
    }
  });

  it('preserves setup-node caching only for GitHub-hosted runners', () => {
    const setupNodeStep = action.match(
      /- name: Setup Node\.js with pnpm cache\n(?<step>[\s\S]*?)(?=\n    - name:)/
    )?.groups?.step;

    expect(setupNodeStep).toContain('uses: actions/setup-node@');
    expect(setupNodeStep).toContain("node-version-file: '.nvmrc'");
    expect(setupNodeStep).toContain(
      "cache: ${{ runner.environment == 'github-hosted' && 'pnpm' || '' }}"
    );
    expect(setupNodeStep).toContain(
      "cache-dependency-path: '**/pnpm-lock.yaml'"
    );
  });

  it('skips non-bundled onnxruntime downloads in both CI install phases', () => {
    for (const stepName of ['Warm pnpm store', 'Install dependencies']) {
      const step = action.match(
        new RegExp(
          `- name: ${stepName}\\n(?<step>[\\s\\S]*?)(?=\\n    - name:|$)`
        )
      )?.groups?.step;

      expect(step).toContain('ONNXRUNTIME_NODE_INSTALL: skip');
    }
    expect(action.match(/ONNXRUNTIME_NODE_INSTALL: skip/g)).toHaveLength(2);
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
    ciWorkflow.indexOf('  # ── CI Optimizer', runnerImageCanaryStart)
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
    writeFileSync(
      fixtureRequirementsPath,
      JSON.stringify({
        ...requirements,
        pnpmStorePath: storePath,
        installedTreeRoot,
        playwrightBrowsersPath: browsersPath,
      })
    );
    return {
      browsersPath,
      installedTreeArchivePath,
      markerPath: resolve(directory, 'manifest.json'),
      requirementsPath: fixtureRequirementsPath,
    };
  }

  function verifierEnvironment(
    fixture: ReturnType<typeof makeFixture>,
    environment: NodeJS.ProcessEnv = process.env
  ) {
    const { GITHUB_OUTPUT: _githubOutput, ...environmentWithoutGithubOutput } =
      environment;
    return {
      ...environmentWithoutGithubOutput,
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
      readonly devDependencies: Readonly<Record<string, string>>;
    };
    expect(requirements.nodeMajor).toBe(22);
    expect(requirements.nodeMinimum).toBe('22.23.1');
    expect(requirements.nodeMinimum).toBe(
      readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim()
    );
    expect(`pnpm@${requirements.pnpmVersion}`).toBe(packageJson.packageManager);
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
      '9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578'
    );
    expect(runnerDockerfile).toContain('sha256sum --check --strict');
    expect(runnerDockerfile).not.toMatch(/curl[\s\S]*?\|\s*tar/);
    expect(runnerDockerfile).toContain(
      'corepack install --global "pnpm@${PNPM_VERSION}"'
    );
    expect(runnerDockerfile).toContain('COREPACK_HOME=/opt/corepack');
    expect(runnerDockerfile).toContain('su -s /bin/bash runner -c');
    expect(runnerDockerfile).toContain(
      '/opt/hostedtoolcache/node/22.23.1/x64/bin/pnpm --version'
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
    const buildTree = execFileSync('git', ['write-tree'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    expect(buildTree).toMatch(/^[0-9a-f]{40}$/);
    const listedPaths = execFileSync(
      'bash',
      [runnerBuildContextScript, buildTree, '--list'],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .trim()
      .split('\n');
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
  });

  it('dispatches an exact-SHA canary only to the dedicated image label', () => {
    expect(runnerImageCanaryStart).toBeGreaterThan(-1);
    expect(runnerImageCanary).toContain(
      "contains(github.event.pull_request.labels.*.name, 'runner-image-canary')"
    );
    expect(runnerImageCanary).toContain(
      'ref: ${{ github.event.pull_request.head.sha }}'
    );
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
      "contains(github.event.pull_request.labels.*.name, 'runner-image-canary')"
    );
    expect(runnerImageOfflineProof).toContain(
      '.github/runner-image/build-context.sh "$EXPECTED_SHA"'
    );
    expect(runnerImageOfflineProof).toContain(
      'uses: crazy-max/ghaction-github-runtime@3cb05d89e1f492524af3d41a1c98c83bc3025124'
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
      'name: runner-image-proof-${{ github.event.pull_request.head.sha }}'
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
      JSON.stringify({ ...requirements, nodeMajor: requirements.nodeMajor + 1 })
    );
    const nodeDrift = spawnSync(
      process.execPath,
      [verifierPath, '--component', 'dependencies'],
      { encoding: 'utf8', env }
    );
    expect(nodeDrift.status).toBe(0);
    expect(nodeDrift.stdout).toContain('dependencies_warm=false');
    expect(nodeDrift.stderr).toContain('does not satisfy');

    writeFileSync(fixture.requirementsPath, JSON.stringify(requirements));
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
