export { readGraph } from './native-typecheck-buildinfo.mjs';

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';

import { check, info, sha, sorted } from './native-typecheck-buildinfo.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function assertGraphParity(
  actual,
  expected,
  {
    compiler = null,
    options = null,
    referenceOptions = options,
    deadline = Infinity,
    maxPairs = 5000,
    maxMs = 45000,
    configuration = null,
  } = {}
) {
  check(
    actual.metadata?.schema === 'jovie-buildinfo-graph/v1' &&
      expected.metadata?.schema === 'jovie-buildinfo-graph/v1',
    'Unknown graph schema'
  );
  check(
    same(actual.repositoryFiles, expected.repositoryFiles) &&
      same(actual.rootFiles, expected.rootFiles),
    'Repository/root graph parity failed'
  );
  const proof = {
    status: 'equal',
    aliases: [],
    nodes: 0,
    edges: 0,
    ambient: [],
    scope:
      'Pinned TS6 resolution API under the measured configuration intent; no checker soundness claim',
  };
  const start = performance.now(),
    end = Math.min(deadline, start + maxMs);
  const bounded = () =>
    check(
      performance.now() < end && proof.nodes < maxPairs,
      'Context proof budget/limit exceeded'
    );
  const identities = new Map();
  const identity = path => {
    bounded();
    if (!identities.has(path)) {
      const stat = statSync(path, { bigint: true });
      check(stat.isFile(), 'Context proof target is not a file');
      identities.set(path, {
        path,
        realpath: realpathSync(path),
        device: BigInt.asUintN(64, stat.dev).toString(),
        inode: BigInt.asUintN(64, stat.ino).toString(),
        sha256: sha(readFileSync(path)),
      });
    }
    return identities.get(path);
  };
  const physicalKey = path => {
    const value = identity(path);
    return `${value.device}:${value.inode}:${value.sha256}`;
  };
  const records = graph => {
    const bytes = readFileSync(graph.metadata.rawBuildInfoPath);
    check(
      sha(bytes) === graph.metadata.rawBuildInfoSha256,
      'Captured graph snapshot hash changed'
    );
    const raw = JSON.parse(bytes.toString());
    const values = new Map();
    raw.fileNames
      .slice(0, raw.fileInfos.length)
      .forEach((name, index) =>
        values.set(
          resolve(dirname(graph.metadata.rawBuildInfoPath), name),
          info(raw.fileInfos[index])
        )
      );
    return values;
  };
  const leftInfo = records(actual),
    rightInfo = records(expected);
  const queue = [],
    seen = new Set();
  const semanticPaths = graph => [
    ...graph.dependencyFiles,
    ...graph.repositoryFiles.map(path =>
      resolve(graph.metadata.rootDirectory, path)
    ),
  ];
  const counterpart = (path, files) =>
    files.find(
      candidate =>
        candidate !== path && physicalKey(candidate) === physicalKey(path)
    );
  for (const [graph, other] of [
    [actual, expected],
    [expected, actual],
  ]) {
    for (const path of graph.dependencyFiles.filter(
      path => !other.dependencyFiles.includes(path)
    )) {
      const target = counterpart(path, other.dependencyFiles);
      check(target, `Unproven physical dependency alias: ${path}`);
      queue.push([path, target]);
    }
    for (const { path } of graph.metadata.auxiliary) {
      const target = counterpart(path, [
        ...graph.dependencyFiles,
        ...other.dependencyFiles,
      ]);
      check(target, `Unproven auxiliary dependency alias: ${path}`);
      queue.push([path, target]);
    }
  }
  if (!queue.length) return proof;
  bounded();
  const configured = configuration?.();
  compiler = configured?.compiler ?? compiler;
  options = configured?.options ?? options;
  referenceOptions = configured?.options ?? referenceOptions;
  const ts = compiler ?? createRequire(import.meta.url)('typescript');
  check(options, 'Context proof requires measured compiler options');
  check(
    same(options, referenceOptions),
    'Different resolution options require a separate configuration proof'
  );
  const packageAt = path => {
    for (let directory = dirname(path), depth = 0; depth < 64; depth++) {
      const manifest = resolve(directory, 'package.json');
      if (existsSync(manifest)) {
        const bytes = readFileSync(manifest),
          data = JSON.parse(bytes.toString());
        if (data.name)
          return {
            directory,
            relativeFile: relative(directory, path),
            name: data.name,
            version: data.version,
            type: data.type ?? 'commonjs',
            hash: sha(bytes),
            peers: data.peerDependencies ?? {},
          };
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    throw new Error(`Unknown package context: ${path}`);
  };
  const packageId = value => value?.packageId ?? null;
  const syntax = (path, modes = true) => {
    const text = readFileSync(path, 'utf8');
    const ast = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS
    );
    check(!ast.parseDiagnostics.length, `Unparsed declaration syntax: ${path}`);
    const supported = node => {
      check(
        !ts.isImportEqualsDeclaration(node) &&
          !(ts.isImportAttribute(node) && node.name.text === 'resolution-mode'),
        'Unsupported conditional import resolution mode'
      );
      ts.forEachChild(node, supported);
    };
    if (modes) supported(ast);
    const format = ts.getImpliedNodeFormatForFile(
      path,
      undefined,
      ts.sys,
      options
    );
    check(
      [undefined, 1, 99].includes(format),
      'Unknown effective declaration format'
    );
    return { text, ast, external: ts.isExternalModule(ast), format };
  };
  const ambientIndexes = new Map();
  const ambient = (specifier, graph) => {
    const key = `${graph.metadata.rawBuildInfoPath}\0${specifier}`;
    if (!ambientIndexes.has(key)) {
      const index = new Map();
      for (const path of semanticPaths(graph).filter(path =>
        path.endsWith('.d.ts')
      )) {
        bounded();
        const text = readFileSync(path, 'utf8');
        if (
          !text.includes(`'${specifier}'`) &&
          !text.includes(`"${specifier}"`)
        )
          continue;
        const { ast } = syntax(path, false);
        if (ts.isExternalModule(ast)) continue;
        for (const node of ast.statements)
          if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name))
            index.set(node.name.text, [
              ...(index.get(node.name.text) ?? []),
              path,
            ]);
      }
      ambientIndexes.set(key, index);
    }
    return sorted(ambientIndexes.get(key).get(specifier) ?? []);
  };
  const physicalMembers = new Map();
  const member = (target, graph) => {
    if (!physicalMembers.has(graph))
      physicalMembers.set(
        graph,
        new Set(semanticPaths(graph).map(physicalKey))
      );
    return physicalMembers.get(graph).has(physicalKey(target));
  };
  const edges = path => {
    const parsed = ts.preProcessFile(readFileSync(path, 'utf8'), true, true);
    check(
      parsed.typeReferenceDirectives.every(
        ref => ref.resolutionMode === undefined
      ),
      'Unsupported type-reference resolution mode'
    );
    return [
      ...parsed.importedFiles.map(ref => ({
        kind: 'import',
        name: ref.fileName,
        target: ts.resolveModuleName(ref.fileName, path, options, ts.sys)
          .resolvedModule,
      })),
      ...parsed.typeReferenceDirectives.map(ref => ({
        kind: 'type',
        name: ref.fileName,
        target: ts.resolveTypeReferenceDirective(
          ref.fileName,
          path,
          options,
          ts.sys
        ).resolvedTypeReferenceDirective,
      })),
      ...parsed.referencedFiles.map(ref => ({
        kind: 'path',
        name: ref.fileName,
        target: { resolvedFileName: resolve(dirname(path), ref.fileName) },
      })),
      ...parsed.libReferenceDirectives.map(ref => ({
        kind: 'lib',
        name: ref.fileName,
        target: null,
      })),
    ];
  };
  while (queue.length) {
    bounded();
    const [left, right] = queue.shift(),
      key = `${left}\0${right}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (left === right) continue;
    proof.nodes++;
    check(
      physicalKey(left) === physicalKey(right),
      'Alias context target physical identity differs'
    );
    const a = packageAt(left),
      b = packageAt(right);
    check(
      same({ ...a, directory: '' }, { ...b, directory: '' }),
      'Alias package/submodule/peer context differs'
    );
    const sa = syntax(left),
      sb = syntax(right);
    check(
      sa.external === sb.external && sa.format === sb.format,
      'Alias module/global format metadata differs'
    );
    const ai = leftInfo.get(left) ?? rightInfo.get(left),
      bi = leftInfo.get(right) ?? rightInfo.get(right);
    check(
      !ai ||
        !bi ||
        ((ai.affectsGlobalScope ?? false) ===
          (bi.affectsGlobalScope ?? false) &&
          (!ai.impliedFormat ||
            !bi.impliedFormat ||
            ai.impliedFormat === bi.impliedFormat)),
      'Alias global/implied format metadata differs'
    );
    check(
      !(ai && bi && (ai.affectsGlobalScope || bi.affectsGlobalScope)),
      'Global semantic aliases require a separate redirect proof'
    );
    const leftPackage = packageId(
      ts.resolveModuleName(a.name, left, options, ts.sys).resolvedModule
    );
    const rightPackage = packageId(
      ts.resolveModuleName(b.name, right, options, ts.sys).resolvedModule
    );
    check(
      leftPackage && rightPackage && same(leftPackage, rightPackage),
      'Alias self-package peer identity differs'
    );
    const le = edges(left),
      re = edges(right);
    check(
      same(
        le.map(({ kind, name }) => [kind, name]),
        re.map(({ kind, name }) => [kind, name])
      ),
      'Alias source reference structure differs'
    );
    const trace = {
      left: identity(left),
      right: identity(right),
      package: {
        name: a.name,
        version: a.version,
        relativeFile: a.relativeFile,
        type: a.type,
        hash: a.hash,
      },
      edges: [],
    };
    for (let i = 0; i < le.length; i++) {
      bounded();
      proof.edges++;
      const l = le[i],
        r = re[i];
      if (l.kind === 'lib') {
        trace.edges.push({
          kind: l.kind,
          name: l.name,
          classification: 'same-standard-library-reference',
        });
        continue;
      }
      const lt = l.target?.resolvedFileName,
        rt = r.target?.resolvedFileName;
      const hasSemanticTargets =
        lt &&
        rt &&
        existsSync(lt) &&
        existsSync(rt) &&
        member(lt, actual) &&
        member(rt, expected);
      if (!hasSemanticTargets) {
        const la = ambient(l.name, actual),
          ra = ambient(r.name, expected);
        check(
          la.length &&
            ra.length &&
            same(sorted(la.map(physicalKey)), sorted(ra.map(physicalKey))),
          `Unproven ambient/context target: ${l.name}`
        );
        proof.ambient.push({ name: l.name, left: la, right: ra });
        for (const path of la)
          queue.push([
            path,
            ra.find(target => physicalKey(target) === physicalKey(path)),
          ]);
        trace.edges.push({
          kind: l.kind,
          name: l.name,
          classification: 'actual-program-ambient',
          left: la,
          right: ra,
        });
        continue;
      }
      check(
        same(packageId(l.target), packageId(r.target)) &&
          physicalKey(lt) === physicalKey(rt),
        `Alias resolved peer/target differs: ${l.name}`
      );
      trace.edges.push({
        kind: l.kind,
        name: l.name,
        left: identity(lt),
        right: identity(rt),
        packageId: packageId(l.target),
      });
      if (lt !== rt) queue.push([lt, rt]);
    }
    proof.aliases.push(trace);
  }
  proof.status = 'context-proven';
  proof.durationMs = performance.now() - start;
  return proof;
}
