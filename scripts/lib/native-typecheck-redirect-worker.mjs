import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const check = (value, message) => {
  if (!value) throw new Error(message);
};
const sha = value => createHash('sha256').update(value).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const normalized = values => [...new Set(values)].sort();
const identity = path => {
  const stat = statSync(path, { bigint: true });
  check(stat.isFile(), `Redirect proof target is not a file: ${path}`);
  return {
    path,
    realpath: realpathSync(path),
    device: String(stat.dev),
    inode: String(stat.ino),
    sha256: sha(readFileSync(path)),
  };
};

function packageAt(path) {
  for (let directory = dirname(path), depth = 0; depth < 64; depth++) {
    const manifest = resolve(directory, 'package.json');
    if (existsSync(manifest)) {
      const bytes = readFileSync(manifest);
      const data = JSON.parse(bytes.toString());
      if (data.name)
        return {
          directory,
          relativeFile: relative(directory, path),
          name: data.name,
          version: data.version,
          type: data.type ?? 'commonjs',
          hash: sha(bytes),
          peers: Object.entries(data.peerDependencies ?? {})
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, requested]) => {
              let parent = directory;
              for (let count = 0; count < 64; count++) {
                const peer = resolve(
                  parent,
                  'node_modules',
                  name,
                  'package.json'
                );
                if (existsSync(peer))
                  return {
                    name,
                    requested,
                    optional:
                      data.peerDependenciesMeta?.[name]?.optional ?? false,
                    version: JSON.parse(readFileSync(peer, 'utf8')).version,
                    manifest: identity(peer),
                  };
                const next = dirname(parent);
                if (next === parent) break;
                parent = next;
              }
              return {
                name,
                requested,
                optional: data.peerDependenciesMeta?.[name]?.optional ?? false,
                version: null,
                manifest: null,
              };
            }),
        };
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`Unknown redirect package context: ${path}`);
}

/** Capture actual TS6 package redirects; equal declarations alone prove nothing. */
export function collectRedirects({ root, config, compilerPath, sourceFiles }) {
  check(
    [root, config, compilerPath].every(
      value => typeof value === 'string' && isAbsolute(value)
    ),
    'Absolute redirect root/config/compiler paths required'
  );
  root = resolve(root);
  check(
    Array.isArray(sourceFiles) && sourceFiles.length,
    'Missing redirect source inventory'
  );
  const sources = sourceFiles
    .map(({ path, sha256 }) => {
      const absolute = resolve(root, path);
      check(
        !isAbsolute(path) &&
          absolute.startsWith(`${root}${sep}`) &&
          !path.split(sep).includes('node_modules') &&
          /^[a-f0-9]{64}$/u.test(sha256),
        'Invalid redirect repository source binding'
      );
      return { path, sha256 };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  check(
    new Set(sources.map(source => source.path)).size === sources.length,
    'Duplicate redirect source binding'
  );
  const verifySources = () => {
    for (const source of sources)
      check(
        sha(readFileSync(resolve(root, source.path))) === source.sha256,
        `Redirect source snapshot changed: ${source.path}`
      );
  };
  verifySources();
  const compiler = identity(compilerPath);
  const ts = createRequire(import.meta.url)(compilerPath);
  check(ts.version === '6.0.3', 'Redirect proof requires pinned TS6 6.0.3');
  const reads = new Map();
  const parseHost = {
    ...ts.sys,
    readFile(path, ...args) {
      const bytes = readFileSync(path);
      reads.set(resolve(path), sha(bytes));
      return ts.sys.readFile(path, ...args);
    },
    onUnRecoverableConfigFileDiagnostic() {
      throw new Error('Redirect configuration could not be parsed');
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, parseHost);
  check(
    parsed && !parsed.errors.length,
    'Redirect configuration contains errors'
  );
  const { configFile, ...options } = parsed.options;
  const configuration = {
    path: config,
    sha256: sha(readFileSync(config)),
    reads: [...reads].map(([path, sha256]) => ({ path, sha256 })),
    optionsSha256: sha(JSON.stringify(options)),
  };
  const host = ts.createCompilerHost(parsed.options);
  host.writeFile = () => {
    throw new Error('Redirect proof forbids emit');
  };
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
    host,
  });
  const files = program.getSourceFiles();
  const repositoryFiles = normalized(
    files
      .map(file => resolve(file.fileName))
      .filter(
        path =>
          path.startsWith(`${root}${sep}`) &&
          !path.includes(`${sep}node_modules${sep}`)
      )
      .map(path => relative(root, path))
  );
  check(
    same(repositoryFiles, sources.map(source => source.path).sort()),
    'Redirect Program repository population differs from snapshot'
  );
  const actual = new Map();
  const addResolution = (kind, resolution, name, mode, containingFile) => {
    const target =
      kind === 'module'
        ? resolution.resolvedModule
        : resolution.resolvedTypeReferenceDirective;
    if (!target) return;
    const path = resolve(target.resolvedFileName);
    const record = {
      kind,
      containingFile,
      name,
      mode: mode ?? null,
      resolvedFileName: path,
      packageId: target.packageId ?? null,
    };
    actual.set(path, [...(actual.get(path) ?? []), record]);
  };
  program.forEachResolvedModule((...args) => addResolution('module', ...args));
  program.forEachResolvedTypeReferenceDirective((...args) =>
    addResolution('type', ...args)
  );
  const resolutions = file => {
    const references = [];
    program.forEachResolvedModule((result, name, mode) => {
      references.push({
        kind: 'module',
        name,
        mode: mode ?? null,
        target: result.resolvedModule,
      });
    }, file);
    program.forEachResolvedTypeReferenceDirective((result, name, mode) => {
      references.push({
        kind: 'type',
        name,
        mode: mode ?? null,
        target: result.resolvedTypeReferenceDirective,
      });
    }, file);
    return references;
  };
  const redirects = [];
  for (const left of files) {
    if (!Object.hasOwn(left, 'redirectInfo')) continue;
    const { redirectTarget: right, unredirected } = left.redirectInfo;
    check(
      right &&
        unredirected &&
        left !== right &&
        left !== unredirected &&
        !Object.hasOwn(right, 'redirectInfo') &&
        program.getSourceFile(left.fileName) === left &&
        program.getSourceFile(right.fileName) === right &&
        Object.getPrototypeOf(left) === right &&
        resolve(unredirected.fileName) === resolve(left.fileName),
      'Invalid actual Program redirect identity'
    );
    const a = identity(resolve(left.fileName));
    const b = identity(resolve(right.fileName));
    check(
      a.sha256 === b.sha256 &&
        sha(unredirected.text) === sha(right.text) &&
        unredirected.text === ts.sys.readFile(left.fileName) &&
        right.text === ts.sys.readFile(right.fileName),
      'Redirect unredirected/raw declaration bytes differ'
    );
    check(
      ts.isExternalModule(unredirected) &&
        ts.isExternalModule(right) &&
        !unredirected.parseDiagnostics.length &&
        !right.parseDiagnostics.length &&
        unredirected.impliedNodeFormat === right.impliedNodeFormat,
      'Redirect external module/format differs'
    );
    const noGlobal = node => {
      check(
        !(node.flags & ts.NodeFlags.GlobalAugmentation),
        'Global redirect requires separate proof'
      );
      check(
        !ts.isImportEqualsDeclaration(node) &&
          !(ts.isImportAttribute(node) && node.name.text === 'resolution-mode'),
        'Unsupported redirect conditional import resolution mode'
      );
      ts.forEachChild(node, noGlobal);
    };
    noGlobal(unredirected);
    noGlobal(right);
    const inbound = [
      ...(actual.get(a.path) ?? []),
      ...(actual.get(b.path) ?? []),
    ];
    const ids = inbound.map(record => record.packageId);
    check(
      (actual.get(a.path) ?? []).length &&
        (actual.get(b.path) ?? []).length &&
        ids.every(id => id && same(id, ids[0])),
      'Actual redirect module/type package IDs differ or are missing'
    );
    check(
      program.redirectTargetsMap
        .get(right.path)
        ?.some(path => resolve(path) === a.path),
      'Actual Program redirect map disagrees'
    );
    const includeReasons = {
      left: program.getFileIncludeReasons().get(left.path) ?? [],
      right: program.getFileIncludeReasons().get(right.path) ?? [],
    };
    check(
      includeReasons.left.length && includeReasons.right.length,
      'Missing actual redirect file-include reasons'
    );
    const leftPackage = packageAt(a.path),
      rightPackage = packageAt(b.path);
    check(
      ids[0].name === leftPackage.name &&
        ids[0].version === leftPackage.version &&
        ids[0].subModuleName === leftPackage.relativeFile &&
        ['undefined', 'string'].includes(typeof ids[0].peerDependencies),
      'Actual redirect package ID does not bind the original submodule'
    );
    check(
      same(
        { ...leftPackage, directory: '', peers: undefined },
        { ...rightPackage, directory: '', peers: undefined }
      ),
      'Redirect package/submodule manifests differ'
    );
    const normalizedPeers = value =>
      value.peers.map(peer => ({
        ...peer,
        manifest: peer.manifest
          ? {
              realpath: peer.manifest.realpath,
              sha256: peer.manifest.sha256,
            }
          : null,
      }));
    check(
      same(normalizedPeers(leftPackage), normalizedPeers(rightPackage)),
      'Redirect effective peer context differs'
    );
    const preA = ts.preProcessFile(unredirected.text, true, true);
    const preB = ts.preProcessFile(right.text, true, true);
    const literals = pre => [
      ...pre.referencedFiles.map(ref => ['path', ref.fileName]),
      ...pre.typeReferenceDirectives.map(ref => ['type', ref.fileName]),
      ...pre.importedFiles.map(ref => ['module', ref.fileName]),
      ...pre.libReferenceDirectives.map(ref => ['lib', ref.fileName]),
    ];
    check(
      same(literals(preA), literals(preB)),
      'Redirect reference literals differ'
    );
    check(
      preA.typeReferenceDirectives.every(
        ref => ref.resolutionMode === undefined
      ),
      'Unsupported redirect type-reference resolution mode'
    );
    const references = preB.referencedFiles.map(ref => {
      const target = program.getSourceFileFromReference(right, ref);
      check(
        target,
        `Canonical redirect path target is not loaded: ${ref.fileName}`
      );
      return {
        kind: 'path',
        name: ref.fileName,
        leftPath: resolve(dirname(a.path), ref.fileName),
        canonicalPath: resolve(target.fileName),
        mode: null,
        packageId: null,
      };
    });
    for (const ref of resolutions(right)) {
      const canonicalPath = ref.target?.resolvedFileName;
      check(
        canonicalPath && program.getSourceFile(canonicalPath),
        `Canonical redirect resolution is not loaded: ${ref.name}`
      );
      references.push({
        kind: ref.kind,
        name: ref.name,
        mode: ref.mode,
        canonicalPath: resolve(canonicalPath),
        packageId: ref.target.packageId ?? null,
      });
    }
    for (const ref of preB.libReferenceDirectives)
      references.push({
        kind: 'lib',
        name: ref.fileName,
        canonicalPath: null,
        mode: null,
        packageId: null,
      });
    for (const [kind, name] of literals(preB))
      check(
        references.some(ref => ref.kind === kind && ref.name === name),
        `Missing actual canonical reference resolution: ${name}`
      );
    redirects.push({
      left: a,
      right: b,
      format: {
        left: unredirected.impliedNodeFormat ?? null,
        right: right.impliedNodeFormat ?? null,
      },
      unredirected: {
        path: resolve(unredirected.fileName),
        textSha256: sha(unredirected.text),
      },
      objectIdentity: {
        sourceAndTargetInProgram: true,
        prototypeIsTarget: true,
        targetIsCanonical: true,
        redirectMapAgrees: true,
      },
      packageId: ids[0],
      inbound,
      includeReasons,
      leftPackage,
      rightPackage,
      references,
    });
  }
  verifySources();
  for (const read of configuration.reads)
    check(
      sha(readFileSync(read.path)) === read.sha256,
      'Redirect configuration changed during proof'
    );
  check(
    identity(compilerPath).sha256 === compiler.sha256,
    'Redirect compiler changed during proof'
  );
  const semanticVersions = new Map();
  for (const file of files) {
    const path = resolve(file.fileName);
    check(!semanticVersions.has(path), 'Duplicate redirect Program path');
    semanticVersions.set(
      path,
      ts.getSourceFileVersionAsHashFromText(ts.sys, file.text)
    );
  }
  return {
    schema: 'jovie-ts6-program-redirects/v1',
    root,
    nodeVersion: process.version,
    config: configuration,
    compiler: { ...compiler, version: ts.version },
    sourceFilesSha256: sha(JSON.stringify(sources)),
    rootFiles: normalized(parsed.fileNames.map(path => relative(root, path))),
    repositoryFiles,
    semanticFiles: normalized(files.map(file => resolve(file.fileName))),
    semanticVersions: Object.fromEntries(semanticVersions),
    redirects,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.stdout.write(
      `${JSON.stringify(collectRedirects(JSON.parse(readFileSync(0, 'utf8'))))}\n`
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
