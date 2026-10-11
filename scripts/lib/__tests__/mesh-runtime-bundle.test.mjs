import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMeshRuntime } from '../../lanes/mesh-runtime-bundle.mjs';

const repo = resolve(import.meta.dirname, '../../..');
const ports = [
  'scripts/lanes/mesh-host-ack.mjs',
  'scripts/lanes/mesh-native-terminal.mjs',
];
const inputs = [
  ...ports,
  '.nvmrc',
  'pnpm-lock.yaml',
  'packages/agent-transport-contracts/work-order.ts',
  'scripts/backlog-orchestrator/summer-triage-assessment-client.mjs',
];
let root;
let archive;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mesh-managed-closure-')));
  archive = join(root, 'archive');
  for (const file of inputs) {
    mkdirSync(dirname(join(archive, file)), { recursive: true });
    copyFileSync(join(repo, file), join(archive, file));
  }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = () => join(archive, 'scripts/lanes/.mesh-runtime');
function dependencies(lock = readFileSync(join(repo, 'pnpm-lock.yaml'))) {
  const deps = join(root, 'deps');
  mkdirSync(deps);
  writeFileSync(join(deps, 'pnpm-lock.yaml'), lock);
  for (const file of [
    'apps/desktop/node_modules',
    'packages/agent-transport-contracts/node_modules',
  ]) {
    mkdirSync(dirname(join(deps, file)), { recursive: true });
    symlinkSync(realpathSync(join(repo, file)), join(deps, file), 'dir');
  }
  return deps;
}

describe('immutable managed mesh dependency closure', () => {
  it('reproduces the raw archive failure, then imports both compiled ports without workspace dependencies', () => {
    const raw = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(join(archive, ports[0]))})`,
      ],
      { encoding: 'utf8' }
    );
    expect(raw.status).not.toBe(0);
    expect(raw.stderr).toContain('ERR_MODULE_NOT_FOUND');
    const proof = buildMeshRuntime(archive, repo);
    expect(proof.isolatedImportPassed).toBe(true);
    expect(proof.recipientAdmission).toBe(false);
    expect(
      proof.externalImports.every(value => value.startsWith('node:'))
    ).toBe(true);
    expect(Object.keys(proof.outputs).sort()).toEqual([
      'receiver.mjs',
      'terminal.mjs',
    ]);
    expect(statSync(portable()).mode & 0o777).toBe(0o700);
    for (const [name, output] of Object.entries(proof.outputs)) {
      expect(hash(readFileSync(join(portable(), name)))).toBe(output.sha256);
      expect(statSync(join(portable(), name)).mode & 0o777).toBe(0o600);
    }
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      const r = await import(${JSON.stringify(join(portable(), 'receiver.mjs'))});
      const t = await import(${JSON.stringify(join(portable(), 'terminal.mjs'))});
      try { await r.createMeshHostAcknowledgments({}).readOwnedTaskAcknowledgment({}); } catch (e) { console.log(e.message); }
      try { t.readNativeJournal('/missing-original-journal'); } catch (e) { console.log(e.code); }
    `,
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(result).toContain('mesh-host-authority-unconfigured');
    expect(result).toContain('ENOENT');
    for (const file of inputs)
      expect(hash(readFileSync(join(archive, file)))).toBe(
        hash(readFileSync(join(repo, file)))
      );
    expect(() => buildMeshRuntime(archive, repo)).toThrow('EEXIST');
  });
  it('uses the actual CLI over the same archive and pins', () => {
    const result = execFileSync(
      process.execPath,
      [join(repo, 'scripts/lanes/mesh-runtime-bundle.mjs'), archive, repo],
      { encoding: 'utf8' }
    );
    expect(JSON.parse(result).outputs['terminal.mjs'].bytes).toBeGreaterThan(0);
    expect(
      JSON.parse(readFileSync(join(portable(), 'manifest.json'), 'utf8'))
        .recipientAdmission
    ).toBe(false);
  });
  it.each(['relative', 'symlink'])('refuses an unbound %s root', value => {
    const alias = join(root, 'alias');
    symlinkSync(archive, alias, 'dir');
    expect(() =>
      buildMeshRuntime(value === 'relative' ? 'relative' : alias, repo)
    ).toThrow('mesh-runtime-root-invalid');
  });
  it('refuses a different Node pin', () => {
    writeFileSync(join(archive, '.nvmrc'), '0.0.0');
    expect(() => buildMeshRuntime(archive, repo)).toThrow(
      'mesh-runtime-node-pin-mismatch'
    );
  });
  it('refuses a different dependency generation', () => {
    const lock = readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8').replace(
      /(  esbuild@0\.28\.2:\n    resolution:.*)sha512-/u,
      '$1sha512-CHANGED'
    );
    writeFileSync(join(archive, 'pnpm-lock.yaml'), lock);
    expect(() => buildMeshRuntime(archive, repo)).toThrow(
      'mesh-runtime-dependency-generation-mismatch'
    );
  });
  it('accepts unchanged exact dependency pins in an older unrelated product lockfile', () => {
    const lock = `${readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8')}\n# unrelated product change\n`;
    const proof = buildMeshRuntime(archive, dependencies(Buffer.from(lock)));
    expect(Object.keys(proof.dependencyPins)).toEqual([
      'esbuild@0.28.2',
      'zod@4.6.5',
      `@esbuild/${process.platform}-${process.arch}@0.28.2`,
    ]);
    expect(proof.isolatedImportPassed).toBe(true);
  });
  it('refuses missing restored dependencies without downloading anything', () => {
    const deps = join(root, 'deps');
    mkdirSync(deps);
    copyFileSync(join(repo, 'pnpm-lock.yaml'), join(deps, 'pnpm-lock.yaml'));
    expect(() => buildMeshRuntime(archive, deps)).toThrow('ENOENT');
  });
  it('refuses changed active compiler binary integrity while wrapper and Zod pins agree', () => {
    const lock = readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8');
    const start = lock.indexOf(
      `  '@esbuild/${process.platform}-${process.arch}@0.28.2':`
    );
    expect(start).toBeGreaterThan(0);
    const changed =
      lock.slice(0, start) +
      lock.slice(start).replace('sha512-', 'sha512-CHANGED');
    writeFileSync(join(archive, 'pnpm-lock.yaml'), changed);
    expect(() => buildMeshRuntime(archive, repo)).toThrow(
      'mesh-runtime-dependency-generation-mismatch'
    );
  });
  it('refuses an unbound compiler binary override before any compilation', () => {
    vi.stubEnv('ESBUILD_BINARY_PATH', '/unbound-test-binary');
    try {
      expect(() => buildMeshRuntime(archive, repo)).toThrow(
        'mesh-runtime-binary-override-unbound'
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('refuses unpinned versions even when both lockfiles agree', () => {
    const lock = readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8').replaceAll(
      '  zod@4.6.5:',
      '  zod@0.0.0:'
    );
    writeFileSync(join(archive, 'pnpm-lock.yaml'), lock);
    expect(() =>
      buildMeshRuntime(archive, dependencies(Buffer.from(lock)))
    ).toThrow('mesh-runtime-dependency-pin-mismatch');
  });
  it('refuses a source dependency outside the exact closure', () => {
    writeFileSync(
      join(archive, ports[0]),
      readFileSync(join(archive, ports[0]), 'utf8') +
        '\nimport "./unapproved.mjs";\n'
    );
    writeFileSync(
      join(archive, 'scripts/lanes/unapproved.mjs'),
      'console.log("unapproved");'
    );
    expect(() => buildMeshRuntime(archive, repo)).toThrow(
      'mesh-runtime-unpinned-input'
    );
  });
});
