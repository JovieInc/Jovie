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

/** @param {string} script @param {{ env?: Record<string, string>, pathPrefix?: string }} [opts] */
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

describe('jovie_setup_playwright_chromium', () => {
  function makeRepo() {
    const root = makeTempDir('jovie-pw-repo-');
    const pkg = join(root, 'apps/web/node_modules/@playwright/test');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{"main":"index.js"}');
    writeFileSync(
      join(pkg, 'index.js'),
      'module.exports={chromium:{executablePath:()=>process.env.FAKE_PW_EXE}};'
    );
    const exe = join(makeTempDir('jovie-pw-browsers-'), 'chrome');
    const bin = makeTempDir('jovie-pw-bin-');
    const log = join(bin, 'pnpm.log');
    writeExecutable(
      join(bin, 'pnpm'),
      `#!/bin/sh\necho "$PWD $*" >> ${JSON.stringify(log)}\n[ "$FAKE_PW_INSTALL" = ok ] || exit 1\nprintf '#!/bin/sh\\n' > "$FAKE_PW_EXE" && chmod +x "$FAKE_PW_EXE"\n`
    );
    return { root, exe, bin, log };
  }

  function run(repo, env = {}) {
    const result = runHelper(
      `set -euo pipefail
       . ${JSON.stringify(helperPath)}
       jovie_setup_playwright_chromium ${JSON.stringify(repo.root)}`,
      {
        env: {
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '',
          FAKE_PW_EXE: repo.exe,
          ...env,
        },
        pathPrefix: repo.bin,
      }
    );
    let calls = '';
    try {
      calls = readFileSync(repo.log, 'utf8');
    } catch {}
    return { result, calls };
  }

  it('skips the install when the pinned browser is already there', () => {
    const repo = makeRepo();
    writeExecutable(repo.exe, '#!/bin/sh\n');
    const { result, calls } = run(repo);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Playwright Chromium: ready');
    expect(calls).toBe('');
  });

  it('installs a missing browser from apps/web with the repo Playwright', () => {
    const repo = makeRepo();
    const { result, calls } = run(repo, { FAKE_PW_INSTALL: 'ok' });
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toBe(
      `${join(repo.root, 'apps/web')} exec playwright install chromium\n`
    );
    expect(result.stdout).toContain('Playwright Chromium: ready');
  });

  it('names the cause and stays non-fatal when downloads are disabled', () => {
    const repo = makeRepo();
    const { result, calls } = run(repo, {
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1');
    expect(calls).toBe('');
  });

  it('stays non-fatal when the install fails', () => {
    const repo = makeRepo();
    const { result } = run(repo, { FAKE_PW_INSTALL: 'fail' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'WARNING: Playwright Chromium install failed'
    );
  });

  it('Claude SessionStart keeps going when setup.sh reports a missing tool', () => {
    expect(sessionStartSh).toContain(
      'if ! "$PROJECT_DIR/scripts/setup.sh"; then'
    );
  });

  it('Claude SessionStart readies the browser in cloud sessions only', () => {
    expect(sessionStartSh).toMatch(
      /CLAUDE_CODE_REMOTE:-\}" = "true" \] && command -v jovie_setup_playwright_chromium[\s\S]*jovie_setup_playwright_chromium "\$PROJECT_DIR"/
    );
  });
});
