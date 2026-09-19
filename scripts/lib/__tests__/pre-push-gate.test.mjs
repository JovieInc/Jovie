import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAffectedTestPlan } from '../../run-affected-tests.mjs';

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
const hookConfigurator = readFileSync(
  resolve(repoRoot, 'scripts/hooks/configure-git-hooks.sh'),
  'utf8'
);
const setupScript = readFileSync(resolve(repoRoot, 'scripts/setup.sh'), 'utf8');

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
  it('uses tracked hook entrypoints so a linked worktree cannot skip pre-push verification', () => {
    expect(hookConfigurator).toContain('config core.hooksPath .husky');
    expect(hookConfigurator).toContain('.husky/pre-push');
    expect(setupScript).toContain('scripts/hooks/configure-git-hooks.sh');
    expect(setupScript).toContain('untracked wrapper directory');
  });

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
    expect(huskyPrePush).toContain(
      'export AUTOMATION_VERIFY_SHARD_CONCURRENCY="${AUTOMATION_VERIFY_SHARD_CONCURRENCY:-1}"'
    );
  });

  it('keeps the documented max-workers knob in the verify bundle', () => {
    expect(automationVerify).toContain(
      '--max-workers "${AUTOMATION_VERIFY_MAX_WORKERS:-2}"'
    );
    expect(automationVerify).toContain(
      '--shard-concurrency "${AUTOMATION_VERIFY_SHARD_CONCURRENCY:-1}"'
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

describe('publication range failures', () => {
  const fixtures = [];

  afterEach(() => {
    for (const root of fixtures.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture({
    missingBase = false,
    unrelated = false,
    empty = false,
  } = {}) {
    const root = mkdtempSync(resolve(tmpdir(), 'jovie-publication-range-'));
    fixtures.push(root);
    const bin = resolve(root, 'bin');
    mkdirSync(bin);
    const env = {
      PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: root,
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'maintenance.auto',
      GIT_CONFIG_VALUE_0: 'false',
      GIT_CONFIG_KEY_1: 'maintenance.autoDetach',
      GIT_CONFIG_VALUE_1: 'false',
      GIT_CONFIG_KEY_2: 'gc.auto',
      GIT_CONFIG_VALUE_2: '0',
      GITLEAKS_BIN: resolve(bin, 'gitleaks'),
      TRUFFLEHOG_BIN: resolve(bin, 'trufflehog'),
      SCAN_LOG: resolve(root, 'scan.log'),
    };
    const git = (...args) => {
      const result = spawnSync('/usr/bin/git', args, {
        cwd: root,
        env,
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    for (const name of ['gitleaks', 'trufflehog']) {
      const file = resolve(bin, name);
      writeFileSync(
        file,
        `#!/bin/sh\nprintf '%s\\n' '${name}' "$*" >> "$SCAN_LOG"\n[ "\${SCAN_FAILURE:-}" != '${name}' ]\n`
      );
      chmodSync(file, 0o755);
    }
    for (const file of [
      'scripts/hooks/pre-push-gate.sh',
      'scripts/hooks/resolve-repo-node.sh',
      'scripts/security/scan-secrets.sh',
      '.nvmrc',
    ]) {
      mkdirSync(dirname(resolve(root, file)), { recursive: true });
      copyFileSync(resolve(repoRoot, file), resolve(root, file));
    }
    for (const file of [
      'scripts/ci-branching-guard.mjs',
      'scripts/lib/policy-gate-liveness.mjs',
      'scripts/hooks/pre-push-gate.test.mjs',
    ]) {
      mkdirSync(dirname(resolve(root, file)), { recursive: true });
      writeFileSync(resolve(root, file), '');
    }
    git('init', '-q');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    writeFileSync(resolve(root, 'seed.txt'), 'seed\n');
    git('add', 'seed.txt');
    git('commit', '-qm', 'seed');
    if (!missingBase) git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    if (!empty) {
      writeFileSync(resolve(root, 'candidate.txt'), 'candidate\n');
      git('add', 'candidate.txt');
      git('commit', '-qm', 'candidate');
    }
    if (unrelated) {
      git('checkout', '--orphan', 'unrelated');
      git('commit', '-qm', 'unrelated root');
    }
    return {
      root,
      env,
      run(script, extraEnv = {}) {
        return spawnSync(
          '/bin/bash',
          ['-x', resolve(root, script), 'publication', 'origin/main'],
          {
            cwd: root,
            encoding: 'utf8',
            env: { ...env, PS4: '+TRACE:${LINENO}: ', ...extraEnv },
          }
        );
      },
      scanLog() {
        try {
          return readFileSync(env.SCAN_LOG, 'utf8');
        } catch (error) {
          if (error.code === 'ENOENT') return '';
          throw error;
        }
      },
    };
  }

  it.each([
    ['missing base', { missingBase: true }],
    ['unrelated histories', { unrelated: true }],
  ])(
    'rejects %s before either publication scanner can report success',
    (_label, options) => {
      const f = fixture(options);
      for (const script of [
        'scripts/hooks/pre-push-gate.sh',
        'scripts/security/scan-secrets.sh',
      ]) {
        const result = f.run(script);
        expect(result.status, result.stdout + result.stderr).not.toBe(0);
        expect(f.scanLog()).toBe('');
        expect(result.stdout).not.toContain('PASS: secret scan');
      }
    }
  );

  it('propagates a changed-file enumeration failure instead of accepting no files', () => {
    const f = fixture();
    const wrapper = resolve(f.root, 'bin/git');
    writeFileSync(
      wrapper,
      '#!/bin/sh\nif [ "$1" = diff ] && [ "$2" = --name-only ]; then exit 7; fi\nexec /usr/bin/git "$@"\n'
    );
    chmodSync(wrapper, 0o755);
    const result = f.run('scripts/security/scan-secrets.sh');
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout).not.toContain('PASS: secret scan');
    expect(f.scanLog()).not.toContain('trufflehog');
  });

  it('scans a real candidate file through both scanners on a valid publication', () => {
    const f = fixture();
    for (const script of [
      'scripts/hooks/pre-push-gate.sh',
      'scripts/security/scan-secrets.sh',
    ]) {
      const result = f.run(script);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain('PASS: secret scan (publication)');
    }
    expect(f.scanLog()).toContain('gitleaks');
    expect(f.scanLog()).toContain('trufflehog');
    expect(f.scanLog()).toContain('candidate.txt');
    expect(f.scanLog()).not.toContain('seed.txt');
  });

  it('accepts a verified empty range without confusing it with failed enumeration', () => {
    const f = fixture({ empty: true });
    for (const script of [
      'scripts/hooks/pre-push-gate.sh',
      'scripts/security/scan-secrets.sh',
    ]) {
      const result = f.run(script);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain('PASS: secret scan (publication)');
    }
    expect(f.scanLog()).toContain('gitleaks');
    expect(f.scanLog()).not.toContain('trufflehog');
  });

  it.each(['gitleaks', 'trufflehog'])('preserves %s scan failures', scanner => {
    const f = fixture();
    const result = f.run('scripts/hooks/pre-push-gate.sh', {
      SCAN_FAILURE: scanner,
    });
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout).not.toContain('PASS: secret scan');
  });
});

it('discovers publication behavior tests in CI for source-only guard edits', () => {
  const workflow = readFileSync(
    resolve(repoRoot, '.github/workflows/ci.yml'),
    'utf8'
  );
  const pattern = workflow.match(/STRUCTURAL_CONTROL_PATTERN='([^']+)'/)?.[1];
  expect(pattern).toBeTruthy();
  for (const file of [
    'scripts/hooks/pre-push-gate.sh',
    'scripts/security/scan-secrets.sh',
  ]) {
    expect(
      spawnSync('grep', ['-Eq', pattern], {
        input: `${file}\n`,
        encoding: 'utf8',
      }).status
    ).toBe(0);
    const plan = buildAffectedTestPlan([file], { isFileAvailable: () => true });
    expect(plan.mode).toBe('selected');
    expect(plan.scriptVitestTests).toContain(
      'scripts/lib/__tests__/pre-push-gate.test.mjs'
    );
  }
});
