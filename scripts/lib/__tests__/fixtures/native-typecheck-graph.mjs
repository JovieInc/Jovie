import { createHash } from 'node:crypto';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { afterEach } from 'node:test';
import { readGraph } from '../../native-typecheck-graph.mjs';

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
  const build = (
    name,
    kind = 'baseline',
    mutate = raw => raw,
    libraries = null
  ) => {
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
      raw.fileIdsList[0].push(raw.fileNames.length);
    }
    save(cache, mutate(raw));
    return readGraph(cache, root, tools, libraries);
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

export { compiler, fixture, options, save, sha };
