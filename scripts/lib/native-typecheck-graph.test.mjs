import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { assertGraphParity, readGraph } from './native-typecheck-graph.mjs';

const compiler = createRequire(import.meta.url)('typescript');
const options = {
  moduleResolution: compiler.ModuleResolutionKind.Node10,
  module: compiler.ModuleKind.CommonJS,
  types: [],
};
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof value === 'string' ? value : JSON.stringify(value)
  );
};

function fixture({ equivalentPeers = true } = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'native-graph-test-'));
  directories.push(directory);
  const root = resolve(directory, 'repo');
  const tools = resolve(directory, 'tools');
  const output = resolve(directory, 'receipts');
  mkdirSync(tools, { recursive: true });
  const context = name =>
    resolve(root, 'node_modules/.pnpm', name, 'node_modules');
  const widgetA = resolve(context('context-a'), 'widget/index.d.ts');
  const widgetB = resolve(context('context-b'), 'widget/index.d.ts');
  const peerA = resolve(context('context-a'), 'peer-lib/index.d.ts');
  const peerB = resolve(context('context-b'), 'peer-lib/index.d.ts');
  for (const name of ['context-a', 'context-b']) {
    save(resolve(context(name), 'widget/package.json'), {
      name: 'widget',
      version: '1.0.0',
      types: 'index.d.ts',
      peerDependencies: { 'peer-lib': '*' },
    });
    save(resolve(context(name), 'peer-lib/package.json'), {
      name: 'peer-lib',
      version: '1.0.0',
      types: 'index.d.ts',
    });
  }
  save(
    widgetA,
    "import type { Peer } from 'peer-lib';\nexport interface Widget { peer: Peer }\n"
  );
  linkSync(widgetA, widgetB);
  save(peerA, "export interface Peer { readonly tag: 'first' }\n");
  if (equivalentPeers) linkSync(peerA, peerB);
  else save(peerB, "export interface Peer { readonly tag: 'second' }\n");
  const source = resolve(root, 'source.ts');
  save(
    source,
    [
      "import type { Widget as First } from './node_modules/.pnpm/context-a/node_modules/widget';",
      "import type { Widget as Second } from './node_modules/.pnpm/context-b/node_modules/widget';",
      'export type Both = First | Second;',
    ].join('\n')
  );
  const info = path => ({
    version: sha(readFileSync(path)),
    impliedFormat: 1,
    affectsGlobalScope: false,
  });
  const extraFiles = [];
  const build = (name, kind = 'baseline', mutate = raw => raw) => {
    const cache = resolve(output, `${name}.tsbuildinfo`);
    const files = [
      ...(kind === 'baseline'
        ? [source, widgetA, widgetB, peerA, peerB]
        : [source, widgetB, peerA, peerB]),
      ...extraFiles,
    ];
    const raw = {
      version: '6.0.3',
      fileNames: files.map(path => relative(dirname(cache), path)),
      fileInfos: files.map(info),
      root: [1],
      fileIdsList: kind === 'baseline' ? [[2, 3], [4], [5]] : [[2], [4]],
      referencedMap:
        kind === 'baseline'
          ? [
              [1, 1],
              [2, 2],
              [3, 3],
            ]
          : [
              [1, 1],
              [2, 2],
            ],
    };
    if (kind === 'auxiliary') {
      raw.fileNames.push(relative(dirname(cache), widgetA));
      raw.fileIdsList[0].push(5);
    }
    save(cache, mutate(raw));
    return readGraph(cache, root, tools);
  };
  return {
    root,
    tools,
    output,
    source,
    widgetA,
    widgetB,
    peerA,
    peerB,
    extraFiles,
    build,
  };
}

test('retains reference-only names while counting only fileInfo-backed inputs', () => {
  const data = fixture();
  const graph = data.build('with-name-pool', 'auxiliary');
  assert.equal(graph.metadata.schema, 'jovie-buildinfo-graph/v1');
  assert.equal(graph.metadata.filenameCount, 5);
  assert.equal(graph.metadata.fileInfoCount, 4);
  assert.equal(graph.metadata.auxiliary.length, 1);
  assert.equal(graph.metadata.auxiliary[0].id, 5);
  assert.equal(graph.metadata.auxiliary[0].path, data.widgetA);
  assert.deepEqual(graph.metadata.auxiliary[0].incomingSourceIds, [1]);
  assert.ok(!graph.dependencyFiles.includes(data.widgetA));
  const proof = assertGraphParity(data.build('candidate', 'candidate'), graph, {
    compiler,
    options,
  });
  assert.equal(proof.status, 'context-proven');
  assert.ok(proof.aliases.length > 0);
});

test('accepts hardlinked declarations only after recursive peer targets agree', () => {
  const data = fixture();
  const proof = assertGraphParity(
    data.build('candidate', 'candidate'),
    data.build('baseline'),
    { compiler, options }
  );
  assert.equal(proof.status, 'context-proven');
  assert.ok(proof.nodes >= 2);
  assert.ok(proof.edges >= 1);
  assert.ok(proof.aliases.length > 0);
});

test('rejects a hardlinked source when its peer contexts resolve to different targets', () => {
  const data = fixture({ equivalentPeers: false });
  const left = statSync(data.widgetA, { bigint: true });
  const right = statSync(data.widgetB, { bigint: true });
  assert.equal(left.dev.toString(), right.dev.toString());
  assert.equal(left.ino.toString(), right.ino.toString());
  assert.deepEqual(readFileSync(data.widgetA), readFileSync(data.widgetB));
  const candidate = data.build('candidate', 'candidate');
  const baseline = data.build('baseline');
  assert.ok(candidate.dependencyFiles.includes(data.peerA));
  assert.ok(candidate.dependencyFiles.includes(data.peerB));
  assert.throws(
    () => assertGraphParity(candidate, baseline, { compiler, options }),
    /alias|context|peer|target|physical|identity/iu
  );
});

test('rejects matching bytes without exact physical file identity', () => {
  const data = fixture();
  const bytes = readFileSync(data.widgetB);
  rmSync(data.widgetB);
  writeFileSync(data.widgetB, bytes);
  assert.notEqual(
    statSync(data.widgetA, { bigint: true }).ino.toString(),
    statSync(data.widgetB, { bigint: true }).ino.toString()
  );
  assert.throws(
    () =>
      assertGraphParity(
        data.build('candidate', 'candidate'),
        data.build('baseline'),
        { compiler, options }
      ),
    /alias|physical|identity/iu
  );
});

test('rejects a different nested peer even when the first resolved target is hardlinked', () => {
  const data = fixture();
  const leafA = resolve(dirname(dirname(data.peerA)), 'leaf-peer/index.d.ts');
  const leafB = resolve(dirname(dirname(data.peerB)), 'leaf-peer/index.d.ts');
  for (const peer of [data.peerA, data.peerB]) {
    save(resolve(dirname(peer), 'package.json'), {
      name: 'peer-lib',
      version: '1.0.0',
      types: 'index.d.ts',
      dependencies: { 'leaf-peer': '1.0.0' },
    });
  }
  writeFileSync(
    data.peerA,
    "import type { Leaf } from 'leaf-peer';\nexport interface Peer { value: Leaf }\n"
  );
  for (const [path, tag] of [
    [leafA, 'first'],
    [leafB, 'second'],
  ]) {
    save(resolve(dirname(path), 'package.json'), {
      name: 'leaf-peer',
      version: '1.0.0',
      types: 'index.d.ts',
    });
    save(path, `export interface Leaf { readonly tag: '${tag}' }\n`);
  }
  data.extraFiles.push(leafA, leafB);
  assert.equal(
    statSync(data.peerA, { bigint: true }).ino,
    statSync(data.peerB, { bigint: true }).ino
  );
  assert.throws(
    () =>
      assertGraphParity(
        data.build('candidate', 'candidate'),
        data.build('baseline'),
        { compiler, options }
      ),
    /alias|context|peer|target|physical|identity/iu
  );
});

test('does not treat an external-module augmentation as a missing module provider', () => {
  const data = fixture();
  writeFileSync(
    data.widgetA,
    "import type { Marker } from 'ambient-only';\nexport interface Widget { marker: Marker }\n"
  );
  const provider = resolve(data.root, 'types/ambient-only.d.ts');
  save(
    provider,
    "export {};\ndeclare module 'ambient-only' { export interface Marker { readonly tag: 'ambient' } }\n"
  );
  data.extraFiles.push(provider);
  const candidate = data.build('candidate', 'candidate');
  const baseline = data.build('baseline');
  assert.throws(
    () => assertGraphParity(candidate, baseline, { compiler, options }),
    /ambient|unresolved|context|target/iu
  );
});

test('accepts a genuine script ambient provider present in both semantic programs', () => {
  const data = fixture();
  writeFileSync(
    data.widgetA,
    "import type { Marker } from 'ambient-only';\nexport interface Widget { marker: Marker }\n"
  );
  const provider = resolve(data.root, 'types/ambient-only.d.ts');
  save(
    provider,
    "declare module 'ambient-only' { export interface Marker { readonly tag: 'ambient' } }\n"
  );
  data.extraFiles.push(provider);
  const globalInfo = raw => {
    raw.fileInfos.at(-1).affectsGlobalScope = true;
    return raw;
  };
  const proof = assertGraphParity(
    data.build('candidate', 'candidate', globalInfo),
    data.build('baseline', 'baseline', globalInfo),
    { compiler, options }
  );
  assert.equal(proof.status, 'context-proven');
  assert.ok(proof.ambient.length > 0);
});

test('does not use a nested namespace declaration as a global ambient provider', () => {
  const data = fixture();
  writeFileSync(
    data.widgetA,
    "import type { Marker } from 'ambient-only';\nexport interface Widget { marker: Marker }\n"
  );
  const provider = resolve(data.root, 'types/nested-ambient.d.ts');
  save(
    provider,
    "declare namespace Container { module 'ambient-only' { export interface Marker { readonly tag: 'ambient' } } }\n"
  );
  data.extraFiles.push(provider);
  const globalInfo = raw => {
    raw.fileInfos.at(-1).affectsGlobalScope = true;
    return raw;
  };
  assert.throws(
    () =>
      assertGraphParity(
        data.build('candidate', 'candidate', globalInfo),
        data.build('baseline', 'baseline', globalInfo),
        { compiler, options }
      ),
    /ambient|unresolved|context|target/iu
  );
});

test('rejects an alias with different global or implied-module metadata', () => {
  for (const change of [{ affectsGlobalScope: true }, { impliedFormat: 99 }]) {
    const data = fixture();
    const baseline = data.build('baseline', 'baseline', raw => {
      Object.assign(raw.fileInfos[1], change);
      return raw;
    });
    assert.throws(
      () =>
        assertGraphParity(data.build('candidate', 'candidate'), baseline, {
          compiler,
          options,
        }),
      /alias|format|global|metadata/iu
    );
  }
});

test('does not collapse different package-relative submodules sharing one physical file', () => {
  const data = fixture();
  const otherSubmodule = resolve(dirname(data.widgetB), 'different.d.ts');
  linkSync(data.widgetA, otherSubmodule);
  const baseline = data.build('baseline', 'baseline', raw => {
    raw.fileNames[2] = relative(data.output, otherSubmodule);
    return raw;
  });
  const candidate = data.build('candidate', 'candidate', raw => {
    raw.fileNames[1] = relative(data.output, otherSubmodule);
    return raw;
  });
  assert.throws(
    () => assertGraphParity(candidate, baseline, { compiler, options }),
    /alias|submodule|file|package/iu
  );
});

test('rejects changed buildinfo bytes before reusing captured graph metadata', () => {
  const data = fixture();
  const baseline = data.build('baseline', 'candidate');
  const candidate = data.build('candidate', 'candidate');
  const path = baseline.metadata.rawBuildInfoPath;
  const captured = readFileSync(path);
  assert.equal(baseline.metadata.rawBuildInfoSha256, sha(captured));
  const changed = JSON.parse(captured.toString('utf8'));
  changed.fileInfos[1].affectsGlobalScope = true;
  save(path, changed);
  assert.throws(
    () => assertGraphParity(candidate, baseline, { compiler, options }),
    /changed|hash|snapshot/iu
  );
});

test('rejects unknown graph structure and unreferenced auxiliary IDs', () => {
  for (const mutate of [
    raw => ({ ...raw, fileInfos: [...raw.fileInfos, ...raw.fileInfos] }),
    raw => ({ ...raw, version: 'unknown-future-buildinfo' }),
    raw => ({
      ...raw,
      fileInfos: raw.fileInfos.map(info => ({ ...info, impliedFormat: 777 })),
    }),
    raw => ({
      ...raw,
      fileInfos: raw.fileInfos.map(info => ({
        version: info.version,
        affectsGlobalScope: info.affectsGlobalScope,
        impliedNodeFormat: 777,
      })),
    }),
    raw => ({
      ...raw,
      fileInfos: raw.fileInfos.map(info => ({
        ...info,
        impliedFormat: 1,
        impliedNodeFormat: 99,
      })),
    }),
  ]) {
    const data = fixture();
    assert.throws(
      () => data.build('invalid', 'candidate', mutate),
      /schema|version|format|fileInfo|graph/iu
    );
  }
  const data = fixture();
  assert.throws(
    () =>
      data.build('orphan-name', 'auxiliary', raw => ({
        ...raw,
        referencedMap: [],
      })),
    /auxiliary|reference|schema|graph/iu
  );
});

test('bounds contextual alias proof instead of accepting incomplete analysis', () => {
  const data = fixture();
  assert.throws(
    () =>
      assertGraphParity(
        data.build('candidate', 'candidate'),
        data.build('baseline'),
        { compiler, options, maxPairs: 0 }
      ),
    /bound|budget|limit|proof/iu
  );
});

test('rejects mode-sensitive imports and triple-slash type references', () => {
  for (const source of [
    "import type Peer = require('peer-lib'); export { Peer };",
    "import type { Peer } from 'peer-lib' with { 'resolution-mode': 'require' }; export { Peer };",
    "/// <reference types='peer-lib' resolution-mode='require' />\nexport {};",
  ]) {
    const data = fixture();
    writeFileSync(data.widgetA, source);
    assert.throws(
      () =>
        assertGraphParity(
          data.build('candidate', 'candidate'),
          data.build('baseline'),
          { compiler, options }
        ),
      /resolution|conditional|mode/iu
    );
  }
});
