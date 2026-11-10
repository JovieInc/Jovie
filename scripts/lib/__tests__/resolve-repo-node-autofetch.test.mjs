// The pre-push resolver falls back to the setup cache, and fetches the pinned
// Node there (checksum-verified) when no conforming Node is installed.
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
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const resolverPath = resolve(repoRoot, 'scripts/hooks/resolve-repo-node.sh');
const pinnedVersion = readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim();

describe('resolve-repo-node.sh setup-cache fallback', () => {
  const temporaryDirectories = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function tempDir(prefix) {
    const directory = mkdtempSync(resolve(tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
  }

  function writeNode(binDirectory, version) {
    mkdirSync(binDirectory, { recursive: true });
    const nodePath = resolve(binDirectory, 'node');
    writeFileSync(nodePath, `#!/bin/sh\necho ${version}\n`);
    chmodSync(nodePath, 0o755);
  }

  // Ambient Node is too old and nvm holds nothing, as on a fresh cloud agent.
  function runResolver(extraEnv) {
    const ambient = tempDir('jovie-node-stub-');
    writeNode(ambient, 'v22.0.0');
    const nvmRoot = tempDir('jovie-nvm-root-');
    return spawnSync('/bin/bash', [resolverPath], {
      encoding: 'utf8',
      env: {
        PATH: `${ambient}:/usr/bin:/bin`,
        NVM_DIR: nvmRoot,
        HOME: nvmRoot,
        JOVIE_NODE_AUTOFETCH: '0',
        ...extraEnv,
      },
    });
  }

  const platform = () => {
    const os = { linux: 'linux', darwin: 'darwin' }[process.platform];
    const arch = { x64: 'x64', arm64: 'arm64' }[process.arch];
    return `node-v${pinnedVersion}-${os}-${arch}`;
  };

  it('uses the pinned build already in the setup cache when nvm has none', () => {
    const cache = tempDir('jovie-node-cache-');
    const bin = resolve(cache, platform(), 'bin');
    writeNode(bin, `v${pinnedVersion}`);
    const result = runResolver({ JOVIE_NODE_CACHE_DIR: cache });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(bin);
  });

  it('fetches the pinned build, checksum-verified, into the setup cache', () => {
    const work = tempDir('jovie-node-dist-');
    const name = platform();
    const dist = resolve(work, 'dist', `v${pinnedVersion}`);
    mkdirSync(dist, { recursive: true });
    writeNode(resolve(work, 'stage', name, 'bin'), `v${pinnedVersion}`);
    const tarball = resolve(dist, `${name}.tar.gz`);
    spawnSync('tar', ['-czf', tarball, '-C', resolve(work, 'stage'), name]);
    const sum = createHash('sha256')
      .update(readFileSync(tarball))
      .digest('hex');
    writeFileSync(resolve(dist, 'SHASUMS256.txt'), `${sum}  ${name}.tar.gz\n`);
    const cache = resolve(work, 'cache');
    const result = runResolver({
      JOVIE_NODE_AUTOFETCH: '1',
      JOVIE_NODE_CACHE_DIR: cache,
      JOVIE_NODE_DIST_URL: `file://${resolve(work, 'dist')}`,
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(resolve(cache, name, 'bin'));
    expect(result.stderr).toContain(`fetching Node ${pinnedVersion}`);
  });

  it('refuses a fetched build whose checksum does not match', () => {
    const work = tempDir('jovie-node-dist-');
    const name = platform();
    const dist = resolve(work, 'dist', `v${pinnedVersion}`);
    mkdirSync(dist, { recursive: true });
    writeFileSync(resolve(dist, `${name}.tar.gz`), 'not a tarball');
    writeFileSync(
      resolve(dist, 'SHASUMS256.txt'),
      `${'0'.repeat(64)}  ${name}.tar.gz\n`
    );
    const result = runResolver({
      JOVIE_NODE_AUTOFETCH: '1',
      JOVIE_NODE_CACHE_DIR: resolve(work, 'cache'),
      JOVIE_NODE_DIST_URL: `file://${resolve(work, 'dist')}`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nvm install');
  });
});
