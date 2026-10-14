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
import {
  buildMeshRuntime,
  importerVersion,
  pinnedRecords,
} from '../../lanes/mesh-runtime-bundle.mjs';

const repo = resolve(import.meta.dirname, '../../..');
const repoLock = readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8');
// Pins come from the reviewed lockfile, so a Dependabot bump needs no edit here.
const compilerPin = importerVersion(repoLock, 'apps/desktop', 'esbuild');
const zodPin = importerVersion(
  repoLock,
  'packages/agent-transport-contracts',
  'zod'
);
const esc = value => value.replaceAll('.', '\\.');
const ports = [
  'scripts/lanes/mesh-host-ack.mjs',
  'scripts/lanes/mesh-native-terminal.mjs',
  'scripts/lanes/mesh-current-wire.mjs',
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
      'wire.mjs',
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
      const w = await import(${JSON.stringify(join(portable(), 'wire.mjs'))});
      try { await r.createMeshHostAcknowledgments({}).readOwnedTaskAcknowledgment({}); } catch (e) { console.log(e.message); }
      try { t.readNativeJournal('/missing-original-journal'); } catch (e) { console.log(e.code); }
      try { w.createCurrentHostReader(null); } catch (e) { console.log(e.message); }
    `,
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(result).toContain('mesh-host-authority-unconfigured');
    expect(result).toContain('ENOENT');
    expect(result).toContain('mesh-current-original-host-binding-unavailable');
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
      new RegExp(
        `(  esbuild@${esc(compilerPin)}:\\n    resolution:.*)sha512-`,
        'u'
      ),
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
      `esbuild@${compilerPin}`,
      `zod@${zodPin}`,
      `@esbuild/${process.platform}-${process.arch}@${compilerPin}`,
    ]);
    expect(proof.isolatedImportPassed).toBe(true);
  });
  it.each([
    'changed-patch-context',
    'missing-snapshot',
    'changed-snapshot-record',
  ])('refuses a %s while Zod package and patch metadata agree', kind => {
    const snapshot = repoLock
      .split('\nsnapshots:\n')[1]
      .split('\n')
      .find(
        line =>
          line.startsWith(`  zod@${zodPin}:`) ||
          line.startsWith(`  zod@${zodPin}(`)
      );
    expect(snapshot).toBeDefined();
    const replacement =
      kind === 'missing-snapshot'
        ? ''
        : kind === 'changed-patch-context'
          ? snapshot.replace(
              `zod@${zodPin}`,
              `zod@${zodPin}(patch_hash=CHANGED)`
            )
          : snapshot.replace(
              ': {}',
              ':\n    optionalDependencies:\n      changed: 1.0.0'
            );
    const changed = repoLock.replace(snapshot, replacement);
    expect(changed).not.toBe(repoLock);
    expect(() =>
      buildMeshRuntime(archive, dependencies(Buffer.from(changed)))
    ).toThrow(
      kind === 'changed-snapshot-record'
        ? 'mesh-runtime-dependency-generation-mismatch'
        : 'mesh-runtime-dependency-pin-mismatch'
    );
    expect(() => statSync(portable())).toThrow('ENOENT');
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
      `  '@esbuild/${process.platform}-${process.arch}@${compilerPin}':`
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
  it.each(['1.2.3', '1.2.3(patch_hash=abc)(peer@4.0.0)'])(
    'binds one package and the exact %s snapshot, ignoring patch metadata',
    resolution => {
      const packageRecord =
        '  zod@1.2.3:\n    resolution: {integrity: sha512-fixture}';
      const snapshotRecord = `  zod@${resolution}: {}`;
      const lock = [
        'patchedDependencies:',
        '  zod@1.2.3:',
        '    hash: abc',
        '    path: patches/zod.patch',
        'packages:',
        packageRecord,
        '  "unrelated@9.0.0": {}',
        '# A section comment does not change record ownership.',
        'snapshots:',
        snapshotRecord,
        '  "unrelated@9.0.0": {}',
      ].join('\n');
      expect(pinnedRecords(lock, 'zod@1.2.3', `zod@${resolution}`)).toEqual([
        hash(Buffer.from(packageRecord)),
        hash(Buffer.from(snapshotRecord)),
      ]);
    }
  );
  it.each([
    ['packages', 'missing'],
    ['packages', 'duplicate'],
    ['snapshots', 'missing'],
    ['snapshots', 'duplicate'],
  ])(
    'refuses %s with a %s relevant record even when patch metadata exists',
    (section, fault) => {
      const packageRecord =
        '  zod@1.2.3:\n    resolution: {integrity: sha512-fixture}';
      const snapshotRecord = '  zod@1.2.3(patch_hash=abc): {}';
      const selected = section === 'packages' ? packageRecord : snapshotRecord;
      const replacement = fault === 'missing' ? '' : `${selected}\n${selected}`;
      const lock = [
        'patchedDependencies:',
        '  zod@1.2.3:',
        '    hash: abc',
        'packages:',
        section === 'packages' ? replacement : packageRecord,
        'snapshots:',
        section === 'snapshots' ? replacement : snapshotRecord,
      ].join('\n');
      expect(() =>
        pinnedRecords(lock, 'zod@1.2.3', 'zod@1.2.3(patch_hash=abc)')
      ).toThrow('mesh-runtime-dependency-pin-mismatch');
    }
  );
  it.each(['inline-fields', 'inline-comment', 'duplicate-section'])(
    'refuses ambiguous relevant records from %s',
    fault => {
      const packageRecord =
        '  zod@1.2.3:\n    resolution: {integrity: sha512-fixture}';
      const snapshotKey = '  zod@1.2.3(patch_hash=abc):';
      const extraSection =
        fault === 'duplicate-section' ? ['packages:', '  other@1.0.0: {}'] : [];
      const extraSnapshot =
        fault === 'inline-fields'
          ? `${snapshotKey} {dependencies: {other: 1.0.0}}`
          : fault === 'inline-comment'
            ? `${snapshotKey} {} # duplicate key`
            : '';
      const lock = [
        'packages:',
        packageRecord,
        ...extraSection,
        'snapshots:',
        `${snapshotKey} {}`,
        extraSnapshot,
      ].join('\n');
      expect(() =>
        pinnedRecords(lock, 'zod@1.2.3', 'zod@1.2.3(patch_hash=abc)')
      ).toThrow('mesh-runtime-dependency-pin-mismatch');
    }
  );
  it.each([
    ['single-quoted package', 'zod@1.2.3', 'packages', "  'zod@1.2.3': {}"],
    ['double-quoted package', 'zod@1.2.3', 'packages', '  "zod@1.2.3": {}'],
    [
      'double-quoted scoped snapshot',
      '@scope/y@1.2.3',
      'snapshots',
      '  "@scope/y@1.2.3(patch_hash=abc)": {}',
    ],
    [
      'single-quoted section',
      'zod@1.2.3',
      'packages',
      "'packages':\n  other@1.0.0: {}",
    ],
    [
      'double-quoted section',
      'zod@1.2.3',
      'packages',
      '"packages":\n  other@1.0.0: {}',
    ],
    [
      'escaped package',
      'zod@1.2.3',
      'packages',
      String.raw`  "\u007aod@1.2.3": {}`,
    ],
    [
      'escaped section',
      'zod@1.2.3',
      'packages',
      String.raw`"\u0070ackages": {}`,
    ],
    [
      'unsupported package encoding',
      'zod@1.2.3',
      'packages',
      String.raw`  "zo\x64@1.2.3": {}`,
    ],
    [
      'unsupported section encoding',
      'zod@1.2.3',
      'packages',
      String.raw`"\x70ackages": {}`,
    ],
    ['unterminated quoted key', 'zod@1.2.3', 'packages', '  "zod@1.2.3: {}'],
  ])(
    'refuses relevant semantic aliases from a %s',
    (_label, name, section, extra) => {
      const canonical = value =>
        value.startsWith('@') ? `  '${value}': {}` : `  ${value}: {}`;
      const snapshotName = `${name}(patch_hash=abc)`;
      const lock = [
        'packages:',
        canonical(name),
        section === 'packages' ? extra : '',
        'snapshots:',
        canonical(snapshotName),
        section === 'snapshots' ? extra : '',
      ].join('\n');
      expect(() => pinnedRecords(lock, name, snapshotName)).toThrow(
        'mesh-runtime-dependency-pin-mismatch'
      );
    }
  );
  it('reads importer pins from the lockfile, ignoring patch and peer suffixes', () => {
    const lock = [
      'importers:',
      '  packages/x:',
      '    dependencies:',
      "      '@scope/y':",
      '        specifier: ^1.0.0',
      '        version: 1.2.3(patch_hash=abc)(react@19.3.0)',
      '      zod:',
      '        specifier: ^4.6.6',
      '        version: 4.6.7',
      '  packages/z:',
      '    dependencies:',
      '      zod:',
      '        specifier: 3.0.0',
      '        version: 3.0.0',
      'packages:',
    ].join('\n');
    expect(importerVersion(lock, 'packages/x', '@scope/y')).toBe('1.2.3');
    expect(importerVersion(lock, 'packages/x', 'zod')).toBe('4.6.7');
    expect(importerVersion(lock, 'packages/z', 'zod')).toBe('3.0.0');
    expect(() => importerVersion(lock, 'packages/x', 'esbuild')).toThrow(
      'mesh-runtime-dependency-pin-mismatch'
    );
    expect(() => importerVersion(lock, 'packages/missing', 'zod')).toThrow(
      'mesh-runtime-dependency-pin-mismatch'
    );
  });
  it('refuses a lockfile importer pin the restored install does not match', () => {
    const lock = repoLock.replace(
      /(  packages\/agent-transport-contracts:[\s\S]*?      zod:\n        specifier: .*\n        version: )[^\n(]+/u,
      '$10.0.1'
    );
    expect(
      importerVersion(lock, 'packages/agent-transport-contracts', 'zod')
    ).toBe('0.0.1');
    writeFileSync(join(archive, 'pnpm-lock.yaml'), lock);
    expect(() =>
      buildMeshRuntime(archive, dependencies(Buffer.from(lock)))
    ).toThrow('mesh-runtime-dependency-pin-mismatch');
  });
  it('refuses unpinned versions even when both lockfiles agree', () => {
    const lock = readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8').replaceAll(
      `  zod@${zodPin}:`,
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
