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
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const helperPath = resolve(repoRoot, 'scripts/lib/setup-worktree-health.sh');
const sessionStartSh = readFileSync(
  resolve(repoRoot, '.claude/hooks/session-start.sh'),
  'utf8'
);

const tempRoots = [];
afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempDir(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeExecutable(filePath, contents) {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function makeWorktree() {
  const root = makeTempDir('jovie-pinned-node-repo-');
  writeFileSync(join(root, '.nvmrc'), '24.21.0\n');
  return root;
}

function makeToolStubs({ nodeVersion }) {
  const bin = makeTempDir('jovie-pinned-node-bin-');
  writeExecutable(join(bin, 'node'), `#!/bin/sh\necho ${nodeVersion}\n`);
  return bin;
}

function runHelper(script, { env = {}, pathPrefix } = {}) {
  return spawnSync('bash', ['-c', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: pathPrefix ? `${pathPrefix}:${process.env.PATH}` : process.env.PATH,
    },
  });
}

describe('jovie_setup_ensure_pinned_node', () => {
  const platform = () => {
    const r = spawnSync('bash', ['-c', 'uname -s; uname -m'], {
      encoding: 'utf8',
    });
    const [os, machine] = r.stdout.trim().split('\n');
    return `${os === 'Darwin' ? 'darwin' : 'linux'}-${/arm64|aarch64/.test(machine) ? 'arm64' : 'x64'}`;
  };

  function makeDist({ goodSum = true } = {}) {
    const dist = makeTempDir('jovie-node-dist-');
    const name = `node-v24.21.0-${platform()}`;
    const build = makeTempDir('jovie-node-build-');
    mkdirSync(join(build, name, 'bin'), { recursive: true });
    writeExecutable(
      join(build, name, 'bin', 'node'),
      '#!/bin/sh\necho v24.21.0\n'
    );
    mkdirSync(join(dist, 'v24.21.0'));
    const tarball = join(dist, 'v24.21.0', `${name}.tar.gz`);
    spawnSync('tar', ['-czf', tarball, '-C', build, name]);
    const sum = spawnSync(
      'bash',
      [
        '-c',
        `(sha256sum "$1" 2>/dev/null || shasum -a 256 "$1") | cut -d' ' -f1`,
        '_',
        tarball,
      ],
      { encoding: 'utf8' }
    ).stdout.trim();
    writeFileSync(
      join(dist, 'v24.21.0', 'SHASUMS256.txt'),
      `${goodSum ? sum : '0'.repeat(64)}  ${name}.tar.gz\n`
    );
    return dist;
  }

  function ensure(dist) {
    const worktree = makeWorktree();
    const cache = makeTempDir('jovie-node-cache-');
    const envFile = join(makeTempDir('jovie-node-env-'), 'env');
    writeFileSync(envFile, '');
    const result = runHelper(
      `set -euo pipefail
       . ${JSON.stringify(helperPath)}
       jovie_setup_ensure_pinned_node ${JSON.stringify(worktree)}
       node --version`,
      {
        pathPrefix: makeToolStubs({ nodeVersion: 'v22.11.0' }),
        env: {
          CLAUDE_ENV_FILE: envFile,
          JOVIE_NODE_CACHE_DIR: cache,
          JOVIE_NODE_DIST_URL: `file://${dist}`,
        },
      }
    );
    return { result, envFile };
  }

  it('fetches the pinned Node over a wrong one and keeps it for the session', () => {
    const { result, envFile } = ensure(makeDist());
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('v24.21.0');
    expect(readFileSync(envFile, 'utf8')).toMatch(
      /^export PATH=.*node-v24\.21\.0-.*\/bin:"\$PATH"\n$/
    );
  });

  it('refuses a download whose checksum does not match', () => {
    const { result, envFile } = ensure(makeDist({ goodSum: false }));
    expect(result.status).not.toBe(0);
    expect(readFileSync(envFile, 'utf8')).toBe('');
  });

  it('Claude SessionStart pins Node before anything else runs', () => {
    expect(sessionStartSh).toContain('jovie_setup_ensure_pinned_node');
    expect(
      sessionStartSh.indexOf('jovie_setup_ensure_pinned_node')
    ).toBeLessThan(sessionStartSh.indexOf('scripts/setup.sh"'));
  });
});
