import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  buildInfoPath,
  check,
  info,
  sha,
} from './native-typecheck-buildinfo.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const captured = new WeakMap();
const digest = path => sha(readFileSync(path));
const sourceDigest = files =>
  sha(JSON.stringify([...files].sort((a, b) => a.path.localeCompare(b.path))));
const measuredPaths = graph => {
  const bytes = readFileSync(graph.metadata.rawBuildInfoPath);
  check(
    sha(bytes) === graph.metadata.rawBuildInfoSha256,
    'Redirect graph snapshot changed'
  );
  const raw = JSON.parse(bytes.toString('utf8'));
  const paths = raw.fileNames
    .slice(0, raw.fileInfos.length)
    .map(name =>
      buildInfoPath(
        name,
        graph.metadata.rawBuildInfoPath,
        graph.metadata.toolsDirectory,
        graph.metadata.libraryDirectory
      )
    );
  check(
    new Set(paths).size === paths.length,
    'Duplicate redirect semantic path'
  );
  return {
    paths: [...paths].sort(),
    versions: Object.fromEntries(
      paths.map((path, index) => [path, info(raw.fileInfos[index]).version])
    ),
  };
};
const semantic = graph =>
  new Set([
    ...graph.dependencyFiles,
    ...graph.repositoryFiles.map(path =>
      resolve(graph.metadata.rootDirectory, path)
    ),
  ]);

function packageUnchanged(value) {
  if (digest(resolve(value.directory, 'package.json')) !== value.hash)
    return false;
  return value.peers.every(peer => {
    let directory = value.directory;
    for (let depth = 0; depth < 64; depth++) {
      const path = resolve(
        directory,
        'node_modules',
        peer.name,
        'package.json'
      );
      if (existsSync(path))
        return (
          peer.manifest &&
          realpathSync(path) === peer.manifest.realpath &&
          digest(path) === peer.manifest.sha256
        );
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    return peer.manifest === null;
  });
}

/** Capture while a seeded/edit mutation is held; certificates never come from JSON files. */
export function createRedirectCapture({ root, tools, deadline, cpus }) {
  const compilerPath = resolve(tools, 'node_modules/ts6/lib/typescript.js');
  const worker = resolve(
    import.meta.dirname,
    'native-typecheck-redirect-worker.mjs'
  );
  return (entry, config) => {
    if (!entry.graph.metadata.auxiliary.length) return null;
    const started = performance.now();
    const sourceFilesSha256 = sourceDigest(entry.sourceFiles);
    const verifySources = () =>
      entry.sourceFiles.forEach(file =>
        check(
          digest(resolve(root, file.path)) === file.sha256,
          `Redirect source snapshot changed: ${file.path}`
        )
      );
    verifySources();
    const measured = measuredPaths(entry.graph);
    const semanticFiles = measured.paths;
    const fingerprint = () =>
      sha(
        JSON.stringify({
          sourceFilesSha256,
          config,
          configSha256: digest(config),
          compilerSha256: digest(compilerPath),
          dependencies: semanticFiles.map(path => [
            path,
            realpathSync(path),
            digest(path),
          ]),
        })
      );
    const key = fingerprint();
    const timeout = Math.floor(Math.min(45_000, deadline - performance.now()));
    check(timeout > 0, 'Redirect certificate budget exceeded');
    const command = [process.execPath, '--max-old-space-size=8192', worker];
    if (cpus) command.unshift('/usr/bin/taskset', '--cpu-list', cpus);
    const result = spawnSync(command[0], command.slice(1), {
      cwd: root,
      encoding: 'utf8',
      timeout,
      killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024,
      input: JSON.stringify({
        root,
        config,
        compilerPath,
        sourceFiles: entry.sourceFiles,
      }),
    });
    check(
      !result.error && result.status === 0,
      `Redirect Program proof failed: ${result.error?.message ?? result.stderr?.slice(0, 1000) ?? result.signal}`
    );
    const certificate = JSON.parse(result.stdout);
    check(
      fingerprint() === key,
      'Redirect dependencies changed during capture'
    );
    verifySources();
    check(
      performance.now() < deadline,
      'Redirect certificate suite deadline exceeded'
    );
    check(
      certificate.schema === 'jovie-ts6-program-redirects/v1' &&
        certificate.root === root &&
        certificate.config.path === config &&
        certificate.config.sha256 === entry.configSha256 &&
        certificate.compiler.path === compilerPath &&
        certificate.compiler.version === '6.0.3' &&
        certificate.sourceFilesSha256 === sourceFilesSha256 &&
        same(certificate.semanticFiles, semanticFiles) &&
        same(Object.keys(certificate.semanticVersions).sort(), semanticFiles) &&
        semanticFiles.every(
          path => certificate.semanticVersions[path] === measured.versions[path]
        ) &&
        same(certificate.rootFiles, entry.graph.rootFiles) &&
        same(certificate.repositoryFiles, entry.graph.repositoryFiles),
      'Redirect Program certificate binding differs from measured snapshot'
    );
    // Keep a private copy. Persisted audit data cannot authorize a future graph.
    captured.set(entry.graph, {
      graphSha256: sha(JSON.stringify(entry.graph)),
      certificate: structuredClone(certificate),
    });
    return {
      ...structuredClone(certificate),
      captureMode: 'fresh-program-for-each-entry',
      durationMs: performance.now() - started,
      graphSha256: sha(JSON.stringify(entry.graph)),
      scope: 'Actual pinned TS6 package redirects; no checker soundness claim',
    };
  };
}

/** Discharge only live-certified redirects and their exact canonical reference targets. */
export function redirectCoverage(graph, other, contexts, information) {
  const semanticRedirects = new Map(),
    auxiliaryRedirects = new Map();
  const record = captured.get(graph);
  if (!record) return { semanticRedirects, auxiliaryRedirects };
  check(
    record.graphSha256 === sha(JSON.stringify(graph)),
    'Captured redirect graph changed'
  );
  const own = semantic(graph),
    opposite = semantic(other);
  const pairs = new Map();
  for (const pair of record.certificate.redirects) {
    const a = information.get(pair.left.path),
      b = information.get(pair.right.path);
    if (!own.has(pair.left.path)) continue;
    check(
      own.has(pair.right.path) &&
        opposite.has(pair.right.path) &&
        pair.left.sha256 === pair.right.sha256 &&
        pair.left.sha256 === digest(pair.left.path) &&
        pair.right.sha256 === digest(pair.right.path) &&
        a &&
        b &&
        !a.affectsGlobalScope &&
        !b.affectsGlobalScope &&
        (a.impliedFormat ?? null) === (b.impliedFormat ?? null) &&
        (a.impliedFormat ?? null) === pair.format.left &&
        (b.impliedFormat ?? null) === pair.format.right &&
        Object.values(pair.objectIdentity).every(value => value === true) &&
        packageUnchanged(pair.leftPackage) &&
        packageUnchanged(pair.rightPackage),
      'Certified redirect provider/context differs'
    );
    for (const ref of pair.references)
      if (ref.kind !== 'lib')
        check(
          own.has(ref.canonicalPath) && opposite.has(ref.canonicalPath),
          `Certified redirect reference lacks a common semantic provider: ${ref.name}`
        );
    pairs.set(pair.left.path, pair);
    if (!opposite.has(pair.left.path))
      semanticRedirects.set(pair.left.path, pair);
  }
  for (const reference of graph.metadata.auxiliary) {
    const incoming = contexts.get(reference.path)?.incoming;
    if (!incoming?.length || !incoming.every(source => pairs.has(source.path)))
      continue;
    const canonical = incoming.map(source => {
      const pair = pairs.get(source.path);
      const matches = pair.references.filter(
        ref => ref.kind === 'path' && ref.leftPath === reference.path
      );
      check(
        matches.length === 1 &&
          own.has(matches[0].canonicalPath) &&
          opposite.has(matches[0].canonicalPath),
        'Certified redirect auxiliary reference differs from actual Program'
      );
      return { owner: source.path, target: pair.right.path, ...matches[0] };
    });
    auxiliaryRedirects.set(reference.path, { path: reference.path, canonical });
  }
  return { semanticRedirects, auxiliaryRedirects };
}
