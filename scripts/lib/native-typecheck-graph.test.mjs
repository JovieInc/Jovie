import assert from 'node:assert/strict';
import {
  linkSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { test } from 'node:test';
import {
  compiler,
  fixture,
  options,
  save,
  sha,
} from './__tests__/fixtures/native-typecheck-graph.mjs';
import { assertGraphParity } from './native-typecheck-graph.mjs';

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

test('accepts identical auxiliary references without inventing a semantic provider', () => {
  const data = fixture();
  const bytes = readFileSync(data.widgetA);
  rmSync(data.widgetA);
  writeFileSync(data.widgetA, bytes);
  assert.notEqual(
    statSync(data.widgetA, { bigint: true }).ino,
    statSync(data.widgetB, { bigint: true }).ino
  );
  const original = data.build('original', 'auxiliary');
  const repeated = data.build('repeated', 'auxiliary');
  assert.deepEqual(original.metadata.auxiliary, repeated.metadata.auxiliary);
  assert.deepEqual(original.dependencyFiles, repeated.dependencyFiles);
  assert.ok(!original.dependencyFiles.includes(data.widgetA));
  assert.equal(
    assertGraphParity(repeated, original, { compiler, options }).status,
    'equal'
  );
});

test('keeps changed auxiliary paths, incoming contexts and captured linkage blocked', () => {
  for (const change of [
    'path',
    'incoming',
    'format',
    'global',
    'linkage',
    'stored-path',
    'id',
  ]) {
    const data = fixture();
    const bytes = readFileSync(data.widgetA);
    rmSync(data.widgetA);
    writeFileSync(data.widgetA, bytes);
    const other = resolve(data.root, 'node_modules/other/index.d.ts');
    save(other, bytes.toString());
    const baseline = data.build('baseline', 'auxiliary');
    const candidate = data.build('candidate', 'auxiliary', raw => {
      if (change === 'path') raw.fileNames[4] = relative(data.output, other);
      if (change === 'incoming') raw.referencedMap[0][0] = 2;
      if (change === 'format') raw.fileInfos[0].impliedFormat = 99;
      if (change === 'global') raw.fileInfos[0].affectsGlobalScope = true;
      return raw;
    });
    if (change === 'linkage')
      candidate.metadata.auxiliary[0].incomingSourceIds = [2];
    if (change === 'stored-path') {
      candidate.metadata.auxiliary[0].path = other;
      baseline.metadata.auxiliary[0].path = other;
    }
    if (change === 'id') {
      for (const graph of [candidate, baseline]) {
        graph.metadata.auxiliary[0].id = 4.5;
        graph.metadata.auxiliary[0].incomingSourceIds = [];
      }
    }
    assert.throws(
      () => assertGraphParity(candidate, baseline, { compiler, options }),
      /auxiliary|linkage|alias/iu,
      change
    );
  }
});

test('binds bare auxiliary library references to their captured pinned directory', () => {
  const data = fixture();
  const libraries = resolve(data.tools, 'compiler/lib');
  save(
    resolve(libraries, 'lib.reference.d.ts'),
    'interface PinnedReference {}'
  );
  const mutate = raw => {
    raw.fileNames[4] = 'lib.reference.d.ts';
    return raw;
  };
  const original = data.build('original', 'auxiliary', mutate, libraries);
  const repeated = data.build('repeated', 'auxiliary', mutate, libraries);
  assert.equal(original.metadata.libraryDirectory, libraries);
  const proof = assertGraphParity(repeated, original, { compiler, options });
  assert.equal(proof.status, 'equal');
  assert.equal(
    proof.sharedAuxiliaryReferences[0].rawPath,
    resolve(libraries, 'lib.reference.d.ts')
  );
  for (const selected of [
    resolve(data.root, 'outside'),
    resolve(data.tools, 'missing'),
  ]) {
    save(
      resolve(data.root, 'outside/lib.reference.d.ts'),
      'interface PinnedReference {}'
    );
    const left = structuredClone(repeated);
    const right = structuredClone(original);
    for (const graph of [left, right]) {
      graph.metadata.libraryDirectory = selected;
      graph.metadata.auxiliary[0].path = resolve(
        selected,
        'lib.reference.d.ts'
      );
    }
    assert.throws(
      () => assertGraphParity(left, right, { compiler, options }),
      /pinned|library|missing|location/iu
    );
  }
});

test('normalizes shared incoming source order without accepting missing semantic inputs', () => {
  const data = fixture();
  const bytes = readFileSync(data.widgetA);
  rmSync(data.widgetA);
  writeFileSync(data.widgetA, bytes);
  const original = data.build('original', 'auxiliary', raw => {
    raw.fileIdsList[1].push(5);
    return raw;
  });
  const reordered = data.build('reordered', 'auxiliary', raw => {
    raw.fileIdsList[1].push(5);
    raw.referencedMap.reverse();
    return raw;
  });
  assert.notDeepEqual(
    original.metadata.auxiliary,
    reordered.metadata.auxiliary
  );
  const proof = assertGraphParity(reordered, original, { compiler, options });
  assert.equal(proof.status, 'equal');
  assert.equal(proof.sharedAuxiliaryReferences[0].incoming.length, 2);
  assert.throws(
    () =>
      assertGraphParity(reordered, original, {
        compiler,
        options,
        deadline: -Infinity,
      }),
    /time|budget/iu
  );

  const unique = resolve(data.root, 'node_modules/unique/index.d.ts');
  save(unique, 'export interface Unique { required: string }');
  data.extraFiles.push(unique);
  const complete = data.build('complete', 'auxiliary');
  data.extraFiles.pop();
  const missing = data.build('missing', 'auxiliary');
  assert.throws(
    () => assertGraphParity(missing, complete, { compiler, options }),
    /dependency|alias|physical/iu
  );
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
