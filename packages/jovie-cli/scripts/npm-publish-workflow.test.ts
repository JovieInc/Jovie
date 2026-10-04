import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(import.meta.dirname, '../../../.github/workflows/npm-publish.yml'),
  'utf8'
);

function assertPublishWorkflowContract(source: string): void {
  expect(source).toMatch(/^on:\n  workflow_dispatch:\s*$/m);
  expect(source).not.toMatch(
    /^\s+(push|pull_request|schedule|workflow_run|repository_dispatch):/m
  );
  expect(source).toMatch(/permissions:\n  contents: read/);
  expect(source).toMatch(/id-token: write/);
  expect(source).toMatch(/runs-on: ubuntu-latest/);
  expect(source).toContain('timeout-minutes: 25');
  expect(source).toContain(
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
  );
  expect(source).toContain(
    'pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413'
  );
  expect(source).toContain(
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'
  );
  expect(source).toMatch(/node-version-file: .nvmrc/);
  expect(source).toContain('registry-url: https://registry.npmjs.org');
  expect(source).toMatch(/node --version.*v24\.21\.0/s);
  expect(source).toContain('pnpm install --frozen-lockfile');
  expect(source).toContain('pnpm --filter @jovie/cli run test:coverage');
  expect(source).toContain('pnpm --filter @jovie/cli run typecheck');
  expect(source).toContain('pnpm --filter @jovie/cli run build');
  expect(source).toContain('pnpm --filter @jovie/cli run pack:dry');
  expect(source).toContain('test "$GITHUB_REF" = refs/heads/main');
  expect(source).toContain('git rev-parse origin/main');
  expect(
    source.match(/test "\$checked_out_sha" = "\$current_main_sha"/g)
  ).toHaveLength(2);
  expect(source).toContain(
    'Checkout drifted from current origin/main immediately before publication.'
  );
  expect(source).toContain(
    "readFileSync('VERSION', 'utf8'), process.env.CLI_RELEASE_VERSION"
  );
  expect(source).toContain(
    'CLI_RELEASE_VERSION: ${{ inputs.release_version }}'
  );
  expect(source).toContain(
    "import { resolveReleaseVersion } from './packages/jovie-cli/scripts/pack-manifest.ts'"
  );
  expect(source).toContain(
    '- name: Run @jovie/cli package smoke\n        env:\n          RELEASE_VERSION: ${{ steps.release.outputs.version }}'
  );
  expect(source).toContain(
    "manifest.repository?.url === 'git+https://github.com/JovieInc/Jovie.git'"
  );
  expect(source).toContain(
    "manifest.repository?.directory === 'packages/jovie-cli'"
  );
  expect(source).toContain('REGISTRY_URL: https://registry.npmjs.org');
  expect(source).toContain('--connect-timeout 10');
  expect(source).toContain('--max-time 30');
  expect(source).toContain('--retry 2');
  expect(source).toContain('--retry-delay 1');
  expect(source).toContain('--retry-max-time 40');
  expect(source).toContain('case "$registry_status" in');
  expect(source).toContain('404)');
  expect(source).toContain('200)');
  // Trusted publishing only: no long-lived npm credential may be wired in.
  expect(source).not.toContain('NPM_TOKEN');
  expect(source).not.toContain('NODE_AUTH_TOKEN:');
  expect(source).not.toContain('NPM_CONFIG_USERCONFIG:');
  expect(source).toContain('npm install --global npm@11.6.2');
  expect(source).toContain('npm >= 11.5.1 is required for trusted publishing');
  expect(source).toContain(
    'npm publish --provenance --access public "$PACKAGE_DIR"'
  );
  expect(source).toContain('- name: Prove public registry release');
  expect(source).toContain('for attempt in {1..12}');
  expect(source).toContain('metadata.dist?.attestations?.url');
  expect(source).toContain('metadata.dist?.attestations?.provenance');
  expect(source).toContain('Array.isArray(metadata.maintainers)');
  expect(source).toContain(
    "['maintainers', Array.isArray(metadata.maintainers) && metadata.maintainers.length > 0]"
  );
  expect(source).toContain('"$PACKAGE_NAME@$RELEASE_VERSION"');
  expect(source).toContain('"$installed_cli" --version');
  expect(source).toContain('"$installed_cli" api openapi');
  expect(source).toContain("contract.info?.title !== 'Jovie Artist API'");
  // JOV-7714: publish only bytes that passed the black-box chaos matrix.
  expect(source).toContain('needs: [chaos-tarball, chaos-matrix]');
  expect(source).toContain('os: [ubuntu-latest, macos-latest, windows-latest]');
  expect(source).toMatch(/node: \[[^\]]*'24\.21\.0'[^\]]*'26'\]/);
  expect(source).toContain('fail-fast: false');
  expect(source).toContain('node "$PACK_DIR/chaos-blackbox.mjs"');
  expect(source).toContain('--profile release');
  expect(source).toContain('npm install --prefix "$CLEAN_DIR"');
  expect(source).toContain(
    'if (!process.env.TESTED_INTEGRITY || pack.integrity !== process.env.TESTED_INTEGRITY) {'
  );
}

describe('manual npm provenance workflow', () => {
  it('locks the release workflow to the exact, tested, unpublished main package', () => {
    assertPublishWorkflowContract(workflow);
  });

  it.each([
    [
      'automatic trigger',
      workflow.replace(
        '  workflow_dispatch:\n',
        '  workflow_dispatch:\n  push:\n'
      ),
    ],
    [
      'provenance permission',
      workflow.replace('      id-token: write', '      id-token: read'),
    ],
    [
      'unpublished version guard',
      workflow.replace('            404)\n', '            204)\n'),
    ],
    [
      'provenance publish flag',
      workflow.replace('--provenance --access public', '--access public'),
    ],
    [
      'final current-main publication recheck',
      workflow.replace(
        '          test "$checked_out_sha" = "$current_main_sha" || {\n            echo "::error::Checkout drifted from current origin/main immediately before publication."\n            exit 1\n          }\n          npm publish',
        '          npm publish'
      ),
    ],
    [
      'token-free trusted publishing',
      workflow.replace(
        '          PACKAGE_DIR: ${{ steps.package.outputs.path }}',
        '          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n          PACKAGE_DIR: ${{ steps.package.outputs.path }}'
      ),
    ],
    [
      'trusted publishing npm version',
      workflow.replace('npm install --global npm@11.6.2', 'true'),
    ],
    [
      'public provenance receipt',
      workflow.replace(
        "['dist.attestations.url', typeof metadata.dist?.attestations?.url === 'string']",
        "['dist.attestations.url', true]"
      ),
    ],
    [
      'chaos gate dependency',
      workflow.replace(
        'needs: [chaos-tarball, chaos-matrix]',
        'needs: [chaos-tarball]'
      ),
    ],
    [
      'Windows chaos runner',
      workflow.replace(
        'os: [ubuntu-latest, macos-latest, windows-latest]',
        'os: [ubuntu-latest]'
      ),
    ],
    [
      'tested-bytes identity check',
      workflow.replace(
        'if (!process.env.TESTED_INTEGRITY || pack.integrity !== process.env.TESTED_INTEGRITY) {',
        'if (false) {'
      ),
    ],
    [
      'fresh install runtime receipt',
      workflow.replace('"$installed_cli" api openapi', 'echo api openapi'),
    ],
  ])('fails closed when the %s is weakened', (_, unsafeWorkflow) => {
    expect(() => assertPublishWorkflowContract(unsafeWorkflow)).toThrow();
  });
});

// Execute the real registry-state shell rather than accepting a marker string.
describe('MCP-only publication resumes an already published artifact', () => {
  it.each([
    ['false', '404', 0],
    ['false', '200', 1],
    ['true', '200', 0],
    ['true', '404', 1],
    ['true', '503', 1],
  ])('mode=%s HTTP=%s fails closed or continues', (mode, status, expected) => {
    const guard = workflow.match(/case "\$registry_status" in[\s\S]*?esac/);
    expect(guard).not.toBeNull();
    const result = spawnSync(
      'bash',
      ['-c', `set -euo pipefail\n${guard?.[0]}`],
      {
        env: {
          ...process.env,
          PACKAGE_NAME: '@jovie/cli',
          release_version: '26.9.16',
          registry_status: status,
          PUBLISH_MCP_ONLY: mode,
        },
        encoding: 'utf8',
      }
    );
    expect(result.status, result.stdout + result.stderr).toBe(expected);
  });
});

describe('bounded MCP publication authority', () => {
  it('keeps both npm and registry side effects behind explicit manual mode', () => {
    expect(workflow).toContain('publish_mcp_only:');
    expect(workflow).toContain('default: false');
    for (const name of [
      'Use npm with trusted publishing support',
      'Publish with npm provenance',
    ]) {
      expect(workflow).toContain(
        `- name: ${name}` + '\n        if: ${{ !inputs.publish_mcp_only }}'
      );
    }
    for (const name of [
      'Verify exact staged bytes and prepare MCP manifest',
      'Publish exact MCP listing using GitHub OIDC',
    ]) {
      expect(workflow).toContain(
        `- name: ${name}` + '\n        if: ${{ inputs.publish_mcp_only }}'
      );
    }
    expect(workflow).toContain(
      'node packages/jovie-cli/scripts/verify-published-package.mjs'
    );
    expect(workflow).toContain('npm audit signatures --prefix');
    expect(workflow).toContain('login github-oidc');
    expect(workflow).toContain(
      'a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc'
    );
    expect(workflow).toContain('Main advanced before MCP publication.');
    expect(workflow).toContain('verifyRegistryReadback(actual, expected)');
  });
});

describe('canonical source validation discovers CLI publication changes', () => {
  const source = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../.github/workflows/source-validation.yml'
    ),
    'utf8'
  );
  function runSourceGate(changed: string, failure: string = '') {
    const step = source.match(
      /- name: Verify changed CLI publication behavior\n(?:        if: [^\n]+\n)?        shell: bash\n        run: \|\n([\s\S]*?)(?=^  security:)/m
    );
    expect(
      step,
      'real Source Validation step must discover and enforce CLI coverage'
    ).not.toBeNull();
    const dir = mkdtempSync(resolve(tmpdir(), 'jovie-cli-source-gate-'));
    const calls = resolve(dir, 'calls');
    try {
      const git = (...args: string[]) => {
        const result = spawnSync('git', args, {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_CONFIG_COUNT: '2',
            GIT_CONFIG_KEY_0: 'user.name',
            GIT_CONFIG_VALUE_0: 'CI fixture',
            GIT_CONFIG_KEY_1: 'user.email',
            GIT_CONFIG_VALUE_1: 'fixture@example.invalid',
          },
        });
        expect(result.status, result.stderr).toBe(0);
      };
      git('init', '-q');
      writeFileSync(resolve(dir, 'README.md'), 'base');
      git('add', '.');
      git('commit', '-qm', 'base');
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      const changedPath = changed || 'README.md';
      mkdirSync(resolve(dir, changedPath, '..'), { recursive: true });
      writeFileSync(resolve(dir, changedPath), 'changed');
      git('add', '.');
      git('commit', '-qm', 'changed');
      writeFileSync(
        resolve(dir, 'pnpm'),
        '#!/bin/bash\nprintf "%s\\n" "$*" >> "$TEST_CALLS"\nif [ "$*" = "--filter @jovie/cli run $TEST_FAILURE" ]; then exit 19; fi\n'
      );
      chmodSync(resolve(dir, 'pnpm'), 0o755);
      const result = spawnSync(
        'bash',
        [
          '-c',
          step![1]
            .replace(/^          /gm, '')
            .replaceAll('${{ github.base_ref }}', 'main'),
        ],
        {
          cwd: dir,
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            TEST_CHANGED: changed,
            TEST_CALLS: calls,
            TEST_FAILURE: failure,
          },
          encoding: 'utf8',
        }
      );
      return {
        status: result.status,
        calls: existsSync(calls)
          ? readFileSync(calls, 'utf8').trim().split('\n')
          : [],
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  it.each([
    'packages/jovie-cli/src/mcp.ts',
    '.github/workflows/npm-publish.yml',
    '.github/workflows/cli-chaos-nightly.yml',
    '.github/workflows/source-validation.yml',
    // Public API routes the CLI calls run the CLI chaos gate too.
    'apps/web/app/api/v1/[username]/route.ts',
    'apps/web/app/api/v1/openapi.json/route.ts',
    'apps/web/app/api/v1/actions/[actionId]/invoke/route.ts',
    'apps/web/app/api/agents/creator-lookup/route.ts',
    'apps/web/app/llms.txt/route.ts',
    'apps/web/app/llms-full.txt/route.ts',
    'apps/web/app/[username]/llms.txt/route.ts',
    'apps/web/lib/api/v1/contract.ts',
  ])(
    'runs real enforced coverage, package, and chaos checks for %s',
    changed => {
      const result = runSourceGate(changed);
      expect(result.status).toBe(0);
      expect(result.calls).toEqual(
        ['test:coverage', 'typecheck', 'build', 'pack:dry', 'chaos:gate'].map(
          command => `--filter @jovie/cli run ${command}`
        )
      );
      for (const path of [
        'packages/jovie-cli',
        '.github/workflows/npm-publish.yml',
        '.github/workflows/source-validation.yml',
      ])
        expect(source).toContain(path);
    }
  );
  it('does not add unrelated package work when no publication surface changed', () => {
    expect(runSourceGate('')).toEqual({ status: 0, calls: [] });
  });
  it.each(['apps/web/app/page.tsx', 'apps/web/app/x/llms.txt/route.ts'])(
    'skips the CLI gate for unrelated web path %s',
    changed => {
      const result = runSourceGate(changed);
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([]);
    }
  );
  it.each(['test:coverage', 'typecheck', 'build', 'pack:dry', 'chaos:gate'])(
    'fails closed immediately when %s fails',
    failure => {
      const result = runSourceGate('packages/jovie-cli/src/mcp.ts', failure);
      expect(result.status).toBe(19);
      expect(result.calls.at(-1)).toBe(`--filter @jovie/cli run ${failure}`);
    }
  );
});

// Execute the actual pre-registry release step with inert Git/registry peers.
// The real Node version selector and package guards are not stubbed.
describe('independent manual CLI release cadence', () => {
  function runReleaseSelection(
    version: string | undefined,
    manifestVersion?: unknown
  ) {
    const step = workflow.match(
      /- name: Verify exact main and unpublished release[\s\S]*?        run: \|\n([\s\S]*?)(?=      - name: Install dependencies)/
    );
    expect(step).not.toBeNull();
    const dir = mkdtempSync(resolve(tmpdir(), 'jovie-cli-release-selection-'));
    try {
      const packageRoot = resolve(dir, 'packages/jovie-cli');
      mkdirSync(resolve(packageRoot, 'scripts'), { recursive: true });
      writeFileSync(resolve(dir, 'VERSION'), '26.9.16\n');
      const manifest = JSON.parse(
        readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')
      );
      if (manifestVersion !== undefined) manifest.version = manifestVersion;
      writeFileSync(
        resolve(packageRoot, 'package.json'),
        JSON.stringify(manifest)
      );
      writeFileSync(
        resolve(packageRoot, 'scripts/pack-manifest.ts'),
        readFileSync(resolve(import.meta.dirname, 'pack-manifest.ts'))
      );
      writeFileSync(
        resolve(dir, 'git'),
        '#!/bin/sh\nif [ "$1" = rev-parse ]; then printf "%040d\n" 1; fi\n'
      );
      writeFileSync(
        resolve(dir, 'curl'),
        '#!/bin/sh\nprintf invoked >> "$TEST_REGISTRY_CALLS"\nprintf 404\n'
      );
      chmodSync(resolve(dir, 'git'), 0o755);
      chmodSync(resolve(dir, 'curl'), 0o755);
      const output = resolve(dir, 'output');
      const calls = resolve(dir, 'registry-calls');
      const result = spawnSync(
        'bash',
        ['-c', step![1].replace(/^          /gm, '')],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            GITHUB_REF: 'refs/heads/main',
            GITHUB_OUTPUT: output,
            RUNNER_TEMP: dir,
            PACKAGE_NAME: '@jovie/cli',
            REGISTRY_URL: 'https://registry.invalid',
            PUBLISH_MCP_ONLY: 'false',
            CLI_RELEASE_VERSION: version ?? '',
            TEST_REGISTRY_CALLS: calls,
          },
        }
      );
      return {
        status: result.status,
        diagnostics: result.stdout + result.stderr,
        versionOutput: (() => {
          try {
            return readFileSync(output, 'utf8');
          } catch {
            return '';
          }
        })(),
        registryCalls: (() => {
          try {
            return readFileSync(calls, 'utf8');
          } catch {
            return '';
          }
        })(),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('selects a CLI release without changing the desktop VERSION', () => {
    const result = runReleaseSelection('26.10.0');
    expect(result.status, result.diagnostics).toBe(0);
    expect(result.versionOutput).toBe('version=26.10.0\n');
    expect(result.registryCalls).toBe('invoked');
  });

  it('uses the canonical VERSION when the optional selection is absent', () => {
    const result = runReleaseSelection(undefined);
    expect(result.status, result.diagnostics).toBe(0);
    expect(result.versionOutput).toBe('version=26.9.16\n');
  });

  it.each(['26.9.16', '', null])(
    'rejects conflicting source pin %j before registry access',
    pin => {
      const result = runReleaseSelection('26.10.0', pin);
      expect(result.status, result.diagnostics).not.toBe(0);
      expect(result.registryCalls).toBe('');
      expect(result.versionOutput).toBe('');
    }
  );

  it('accepts a source manifest already pinned to the selected release', () => {
    const result = runReleaseSelection('26.10.0', '26.10.0');
    expect(result.status, result.diagnostics).toBe(0);
    expect(result.versionOutput).toBe('version=26.10.0\n');
  });

  it.each([
    ' ',
    ' 26.10.0',
    '26.10.0\n',
    '26.10.00',
    '26.13.0',
    '26.10.0-rc.1',
    '$(touch forbidden)',
    '26.10.9007199254740992',
  ])(
    'rejects explicit malformed input %j before touching the registry',
    version => {
      const result = runReleaseSelection(version);
      expect(result.status, result.diagnostics).not.toBe(0);
      expect(result.registryCalls).toBe('');
      expect(result.versionOutput).toBe('');
    }
  );
});
