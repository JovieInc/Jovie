/** Compile the immutable managed archive using already-restored, exact pins.
 * No dependency install, signer, admission, provider or service activation.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pinnedRecords = (lock, name) => {
  const lines = lock.toString().split('\n');
  const records = [];
  const header = name.startsWith('@') ? `  '${name}':` : `  ${name}:`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== header && lines[i] !== `${header} {}`) continue;
    let end = i + 1;
    while (
      end < lines.length &&
      (!lines[end].trim() || lines[end].startsWith('    '))
    )
      end++;
    records.push(sha(Buffer.from(lines.slice(i, end).join('\n').trimEnd())));
  }
  if (records.length !== 2)
    throw new Error('mesh-runtime-dependency-pin-mismatch');
  return records;
};
export function buildMeshRuntime(sourceRoot, dependencyRoot) {
  if (process.env.ESBUILD_BINARY_PATH)
    throw new Error('mesh-runtime-binary-override-unbound');
  for (const root of [sourceRoot, dependencyRoot])
    if (
      !isAbsolute(root) ||
      realpathSync(root) !== root ||
      !statSync(root).isDirectory()
    )
      throw new Error('mesh-runtime-root-invalid');
  const pin = readFileSync(join(sourceRoot, '.nvmrc'), 'utf8')
    .trim()
    .replace(/^v/u, '');
  if (pin !== process.versions.node)
    throw new Error('mesh-runtime-node-pin-mismatch');
  const lock = readFileSync(join(sourceRoot, 'pnpm-lock.yaml'));
  const restoredLock = readFileSync(join(dependencyRoot, 'pnpm-lock.yaml'));
  const dependencyPins = {};
  const binaryName = `@esbuild/${process.platform}-${process.arch}`;
  // The host repo may retain an older product checkout while its updater tracks
  // main. Compare both exact package/integrity and dependency snapshot records,
  // rather than requiring unrelated product lockfile entries to be identical.
  for (const name of ['esbuild@0.28.2', 'zod@4.6.5', `${binaryName}@0.28.2`]) {
    const expected = pinnedRecords(lock, name);
    if (
      JSON.stringify(expected) !==
      JSON.stringify(pinnedRecords(restoredLock, name))
    )
      throw new Error('mesh-runtime-dependency-generation-mismatch');
    dependencyPins[name] = expected;
  }
  const compilerPackage = realpathSync(
    join(dependencyRoot, 'apps/desktop/node_modules/esbuild/package.json')
  );
  const compiler = createRequire(compilerPackage)(dirname(compilerPackage));
  const binaryPackage = createRequire(compilerPackage).resolve(
    `${binaryName}/package.json`
  );
  const binaryMetadata = JSON.parse(readFileSync(binaryPackage, 'utf8'));
  if (binaryMetadata.version !== '0.28.2')
    throw new Error('mesh-runtime-binary-pin-mismatch');
  const binarySha256 = sha(
    readFileSync(join(dirname(binaryPackage), 'bin/esbuild'))
  );
  const zodPackage = realpathSync(
    join(
      dependencyRoot,
      'packages/agent-transport-contracts/node_modules/zod/package.json'
    )
  );
  const zodRoot = realpathSync(dirname(zodPackage));
  const zod = JSON.parse(readFileSync(zodPackage, 'utf8'));
  if (
    compiler.version !== '0.28.2' ||
    zod.version !== '4.6.5' ||
    !lock.includes('  esbuild@0.28.2:') ||
    !lock.includes('  zod@4.6.5:')
  )
    throw new Error('mesh-runtime-dependency-pin-mismatch');
  const sourceFiles = [
    'scripts/lanes/mesh-host-ack.mjs',
    'scripts/lanes/mesh-native-terminal.mjs',
    'packages/agent-transport-contracts/work-order.ts',
    'scripts/backlog-orchestrator/summer-triage-assessment-client.mjs',
    'scripts/lanes/mesh-current-wire.mjs',
  ];
  const allowed = new Set(
    sourceFiles.map(file => realpathSync(join(sourceRoot, file)))
  );
  const result = compiler.buildSync({
    absWorkingDir: sourceRoot,
    entryPoints: {
      receiver: sourceFiles[0],
      terminal: sourceFiles[1],
      wire: sourceFiles[4],
    },
    nodePaths: [dirname(zodRoot)],
    outdir: 'compiled-mesh',
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    minify: true,
    legalComments: 'none',
    write: false,
    metafile: true,
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const path = realpathSync(resolve(sourceRoot, input));
    if (!allowed.has(path) && !path.startsWith(`${zodRoot}/`))
      throw new Error('mesh-runtime-unpinned-input');
  }
  const imports = Object.values(result.metafile.outputs).flatMap(
    value => value.imports
  );
  if (imports.some(value => !value.external || !value.path.startsWith('node:')))
    throw new Error('mesh-runtime-incomplete-dependency-closure');
  const destination = join(sourceRoot, 'scripts/lanes/.mesh-runtime');
  mkdirSync(destination, { mode: 0o700 });
  const outputs = {};
  for (const output of result.outputFiles) {
    const name = output.path.split('/').at(-1);
    if (!['receiver.mjs', 'terminal.mjs', 'wire.mjs'].includes(name))
      throw new Error('mesh-runtime-output-unbound');
    writeFileSync(join(destination, name), output.contents, {
      mode: 0o600,
      flag: 'wx',
    });
    outputs[name] = {
      sha256: sha(output.contents),
      bytes: output.contents.length,
    };
  }
  // New process imports only the compiled archive. It has no caller dependencies.
  const receiver = pathToFileURL(join(destination, 'receiver.mjs')).href;
  const terminal = pathToFileURL(join(destination, 'terminal.mjs')).href;
  const wire = pathToFileURL(join(destination, 'wire.mjs')).href;
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    const r = await import(${JSON.stringify(receiver)});
    const t = await import(${JSON.stringify(terminal)});
    const w = await import(${JSON.stringify(wire)});
    let refused = false;
    try { await r.createMeshHostAcknowledgments({}).readOwnedTaskAcknowledgment({}); } catch (e) {
      if (e.message !== 'mesh-host-authority-unconfigured') throw e;
      refused = true;
    }
    if (!refused || typeof t.readNativeJournal !== 'function' ||
        typeof t.assembleNativeTerminal !== 'function') throw Error('mesh-runtime-port-invalid');
    let signerRefused = false;
    try { w.createCurrentHostReader(null); } catch (e) {
      if (e.message !== 'mesh-current-original-host-binding-unavailable') throw e;
      signerRefused = true;
    }
    if (!signerRefused) throw Error('mesh-runtime-wire-unconfigured-refusal-missing');
  `,
    ],
    { cwd: destination, timeout: 30_000, stdio: 'pipe' }
  );
  const manifest = {
    schema: 'jovie.mesh-managed-runtime/v1',
    node: pin,
    compiler: compiler.version,
    zod: zod.version,
    lockfileSha256: sha(lock),
    dependencyPins,
    compilerBinary: {
      package: binaryName,
      version: binaryMetadata.version,
      sha256: binarySha256,
    },
    sourceFiles: Object.fromEntries(
      sourceFiles.map(file => [file, sha(readFileSync(join(sourceRoot, file)))])
    ),
    outputs,
    externalImports: [...new Set(imports.map(value => value.path))].sort(),
    isolatedImportPassed: true,
    recipientAdmission: false,
  };
  writeFileSync(
    join(destination, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600, flag: 'wx' }
  );
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(
    JSON.stringify(buildMeshRuntime(process.argv[2], process.argv[3]))
  );
