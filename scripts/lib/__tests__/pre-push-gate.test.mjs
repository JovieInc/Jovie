import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const resolverPath = resolve(repoRoot, 'scripts/hooks/resolve-repo-node.sh');
const pinnedVersion = readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim();
const gate = readFileSync(
  resolve(repoRoot, 'scripts/hooks/pre-push-gate.sh'),
  'utf8'
);
const automationVerify = readFileSync(
  resolve(repoRoot, 'scripts/automation-verify.sh'),
  'utf8'
);
const huskyPrePush = readFileSync(resolve(repoRoot, '.husky/pre-push'), 'utf8');

describe('resolve-repo-node.sh', () => {
  const temporaryDirectories = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function makeNodeStub(version) {
    const directory = mkdtempSync(resolve(tmpdir(), 'jovie-node-stub-'));
    temporaryDirectories.push(directory);
    const nodePath = resolve(directory, 'node');
    writeFileSync(nodePath, `#!/bin/sh\necho ${version}\n`);
    chmodSync(nodePath, 0o755);
    return directory;
  }

  function makeNvmRoot(withPinnedInstall) {
    const directory = mkdtempSync(resolve(tmpdir(), 'jovie-nvm-root-'));
    temporaryDirectories.push(directory);
    if (withPinnedInstall) {
      const binDirectory = resolve(
        directory,
        'versions/node',
        `v${pinnedVersion}`,
        'bin'
      );
      mkdirSync(binDirectory, { recursive: true });
      const nodePath = resolve(binDirectory, 'node');
      writeFileSync(nodePath, `#!/bin/sh\necho v${pinnedVersion}\n`);
      chmodSync(nodePath, 0o755);
    }
    return directory;
  }

  function runResolver(nodeVersion, withPinnedInstall) {
    const nodeBin = makeNodeStub(nodeVersion);
    const nvmRoot = makeNvmRoot(withPinnedInstall);
    const result = spawnSync('/bin/bash', [resolverPath], {
      encoding: 'utf8',
      env: {
        PATH: `${nodeBin}:/usr/bin:/bin`,
        NVM_DIR: nvmRoot,
        HOME: nvmRoot,
      },
    });
    return { nvmRoot, result };
  }

  it('keeps the ambient Node silently when it exactly satisfies .nvmrc', () => {
    const { result } = runResolver(`v${pinnedVersion}`, false);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('keeps a newer same-major ambient Node', () => {
    const [major, minor] = pinnedVersion.split('.').map(Number);
    const { result } = runResolver(`v${major}.${minor + 1}.0`, false);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('rejects an older same-major ambient Node in favor of the pinned install', () => {
    const [major, minor, patch] = pinnedVersion.split('.').map(Number);
    const older = `v${major}.${minor}.${Math.max(patch - 1, 0)}`;
    const { nvmRoot, result } = runResolver(older, true);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      `${nvmRoot}/versions/node/v${pinnedVersion}/bin`
    );
  });

  it('rejects a newer-major ambient Node (engines ceiling) in favor of the pinned install', () => {
    const [major] = pinnedVersion.split('.').map(Number);
    const { nvmRoot, result } = runResolver(`v${major + 1}.0.0`, true);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      `${nvmRoot}/versions/node/v${pinnedVersion}/bin`
    );
  });

  it('fails fast with an actionable message when no conforming Node exists', () => {
    const [major, minor, patch] = pinnedVersion.split('.').map(Number);
    const older = `v${major}.${minor}.${Math.max(patch - 1, 0)}`;
    const { result } = runResolver(older, false);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `does not satisfy .nvmrc (${pinnedVersion})`
    );
    expect(result.stderr).toContain(older);
    expect(result.stderr).toContain('nvm install');
  });
});

describe('pre-push gate Node and fanout wiring (JOV-4329)', () => {
  it('resolves a repo-conforming Node before the gate dispatches', () => {
    expect(gate).toContain('bash scripts/hooks/resolve-repo-node.sh');
    expect(gate).toContain('export PATH="$RESOLVED_NODE_BIN:$PATH"');
    expect(gate.indexOf('resolve-repo-node.sh')).toBeLessThan(
      gate.indexOf('case "$MODE" in')
    );
  });

  it('resolves a repo-conforming Node for standalone automation-verify runs', () => {
    expect(automationVerify).toContain(
      'bash scripts/hooks/resolve-repo-node.sh'
    );
    expect(automationVerify.indexOf('resolve-repo-node.sh')).toBeLessThan(
      automationVerify.indexOf('case "$SCOPE" in')
    );
  });

  it('keeps the resolve step ahead of the affected-test runner', () => {
    expect(automationVerify.indexOf('resolve-repo-node.sh')).toBeLessThan(
      automationVerify.indexOf('node scripts/run-affected-tests.mjs')
    );
  });

  it('defaults hook pushes to a single vitest worker without clobbering overrides', () => {
    expect(huskyPrePush).toContain(
      'export AUTOMATION_VERIFY_MAX_WORKERS="${AUTOMATION_VERIFY_MAX_WORKERS:-1}"'
    );
    expect(huskyPrePush).not.toMatch(/^AUTOMATION_VERIFY_MAX_WORKERS=1$/m);
  });

  it('keeps the documented max-workers knob in the verify bundle', () => {
    expect(automationVerify).toContain(
      '--max-workers "${AUTOMATION_VERIFY_MAX_WORKERS:-2}"'
    );
  });

  it('wires ssh keepalives into setup so long gates do not SIGPIPE git push', () => {
    // git push holds the ssh receive-pack connection open across the hook;
    // GitHub closes idle connections (~10 min) and git then dies with exit
    // 141 right after a long gate. setup.sh must set core.sshCommand
    // keepalives, and the hook must document why they matter.
    const setupSh = readFileSync(resolve(repoRoot, 'scripts/setup.sh'), 'utf8');
    expect(setupSh).toContain(
      'ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=10'
    );
    expect(setupSh).toContain('config core.sshCommand');
    expect(huskyPrePush).toContain('SIGPIPE');
  });
});
