import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { readGraph, sha } from './native-typecheck-buildinfo.mjs';
import { withMutation } from './native-typecheck-evidence.mjs';
import { assertGraphParity } from './native-typecheck-graph.mjs';
import { createRedirectCapture } from './native-typecheck-redirect.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const directories = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach(path => rmSync(path, { recursive: true, force: true }))
);
const save = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof value === 'string' ? value : JSON.stringify(value)
  );
};

function fixture({
  extraOwner = false,
  missingProvider = false,
  global = false,
} = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'native-redirect-coverage-'));
  directories.push(directory);
  const root = resolve(directory, 'repo'),
    tools = resolve(directory, 'tools');
  mkdirSync(resolve(tools, 'node_modules'), { recursive: true });
  symlinkSync(
    dirname(dirname(require.resolve('typescript'))),
    resolve(tools, 'node_modules/ts6'),
    'junction'
  );
  const widget = name =>
    resolve(root, 'node_modules', name, 'node_modules/widget/index.d.ts');
  for (const name of ['first', 'second']) {
    const context = resolve(root, 'node_modules', name);
    save(resolve(context, 'package.json'), {
      name,
      version: '1.0.0',
      types: 'index.d.ts',
    });
    save(
      resolve(context, 'index.d.ts'),
      "export type { Widget } from 'widget';\n"
    );
    save(resolve(dirname(widget(name)), 'package.json'), {
      name: 'widget',
      version: '1.0.0',
      types: 'index.d.ts',
    });
    save(
      widget(name),
      "/// <reference path='./child.d.ts' />\nexport declare class Widget { private brand; }\n"
    );
    save(
      resolve(dirname(widget(name)), 'child.d.ts'),
      'export interface Child { readonly value: 1 }\n'
    );
  }
  const source = resolve(root, 'source.ts'),
    config = resolve(root, 'tsconfig.json');
  save(
    source,
    "import type { Widget as A } from 'first';\nimport type { Widget as B } from 'second';\nexport type Both = A | B;\n"
  );
  save(config, {
    compilerOptions: {
      noLib: true,
      types: [],
      module: 'commonjs',
      moduleResolution: 'node',
    },
    files: ['source.ts'],
  });
  const parsed = ts.getParsedCommandLineOfConfigFile(
    config,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic() {
        throw new Error('Invalid fixture configuration');
      },
    }
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  const files = program.getSourceFiles().map(file => resolve(file.fileName));
  const formats = new Map(
    program
      .getSourceFiles()
      .map(file => [resolve(file.fileName), file.impliedNodeFormat])
  );
  const left = widget('second'),
    right = widget('first');
  assert.ok(Object.hasOwn(program.getSourceFile(left), 'redirectInfo'));
  const auxiliary = resolve(dirname(left), 'child.d.ts');
  const provider = resolve(dirname(right), 'child.d.ts');
  const build = (name, candidate = false, mutate = _raw => {}) => {
    const paths = files.filter(
      path =>
        !candidate || (path !== left && (!missingProvider || path !== provider))
    );
    const cache = resolve(directory, `${name}.tsbuildinfo`);
    const info = paths.map(path => ({
      version: sha(readFileSync(path)),
      impliedFormat: formats.get(path),
      affectsGlobalScope: global && path === left,
    }));
    const owners = [
      paths.indexOf(left) + 1,
      ...(extraOwner ? [paths.indexOf(source) + 1] : []),
    ];
    const raw = {
      version: '6.0.3',
      fileNames: [...paths, ...(!candidate ? [auxiliary] : [])].map(path =>
        relative(dirname(cache), path)
      ),
      fileInfos: info,
      root: [paths.indexOf(source) + 1],
      fileIdsList: candidate ? [] : [[paths.length + 1]],
      referencedMap: candidate ? [] : owners.map(id => [id, 1]),
    };
    mutate(raw);
    save(cache, raw);
    return readGraph(cache, root, tools);
  };
  const entry = graph => ({
    graph,
    configSha256: sha(readFileSync(config)),
    sourceFiles: [{ path: 'source.ts', sha256: sha(readFileSync(source)) }],
  });
  const capture = createRedirectCapture({
    root,
    tools,
    deadline: Infinity,
    cpus: null,
  });
  return {
    root,
    tools,
    config,
    source,
    left,
    right,
    provider,
    auxiliary,
    build,
    entry,
    capture,
  };
}

test('requires a live Program redirect and canonical provider for semantic and auxiliary coverage', () => {
  const data = fixture(),
    baseline = data.build('baseline'),
    candidate = data.build('candidate', true);
  assert.throws(
    () => assertGraphParity(candidate, baseline),
    /Unproven physical dependency alias/
  );
  const certificate = data.capture(data.entry(baseline), data.config);
  assert.equal(certificate.redirects.length, 1);
  assert.equal(certificate.captureMode, 'fresh-program-for-each-entry');
  const proof = assertGraphParity(candidate, baseline);
  assert.equal(proof.programRedirects.length, 1);
  assert.equal(proof.redirectAuxiliaryReferences.length, 1);
  assert.equal(proof.programRedirects[0].left.path, data.left);
  assert.equal(proof.programRedirects[0].right.path, data.right);
  assert.equal(
    proof.redirectAuxiliaryReferences[0].canonical[0].canonicalPath,
    data.provider
  );
});

test('captures each matching snapshot afresh and retains every raw graph record', () => {
  const data = fixture(),
    baseline = data.build('baseline');
  const bytes = JSON.stringify(baseline);
  data.capture(data.entry(baseline), data.config);
  const second = data.capture(data.entry(baseline), data.config);
  assert.equal(second.captureMode, 'fresh-program-for-each-entry');
  assert.equal(JSON.stringify(baseline), bytes);
  const oldEntry = data.entry(baseline);
  save(
    data.source,
    `${readFileSync(data.source, 'utf8')}\nexport type Edited = never;\n`
  );
  assert.throws(
    () => data.capture(oldEntry, data.config),
    /source snapshot changed/
  );
});

test('persisted certificates cannot be rehydrated to authorize another graph', () => {
  const data = fixture(),
    baseline = data.build('baseline'),
    candidate = data.build('candidate', true);
  const certificate = data.capture(data.entry(baseline), data.config);
  const copy = JSON.parse(JSON.stringify(baseline));
  copy.metadata.redirectProof = certificate;
  assert.throws(
    () => assertGraphParity(candidate, copy),
    /Unproven physical dependency alias/
  );
});

test('blocks an auxiliary reference with any uncertified incoming owner', () => {
  const data = fixture({ extraOwner: true }),
    baseline = data.build('baseline');
  data.capture(data.entry(baseline), data.config);
  assert.throws(
    () => assertGraphParity(data.build('candidate', true), baseline),
    /Unproven auxiliary dependency alias/
  );
});

test('blocks a missing canonical child even with a valid live redirect', () => {
  const data = fixture({ missingProvider: true }),
    baseline = data.build('baseline');
  data.capture(data.entry(baseline), data.config);
  assert.throws(
    () => assertGraphParity(data.build('candidate', true), baseline),
    /common semantic provider/
  );
});

test('blocks global fileInfo metadata despite equal files and a Program redirect', () => {
  const data = fixture({ global: true }),
    baseline = data.build('baseline');
  data.capture(data.entry(baseline), data.config);
  assert.throws(
    () => assertGraphParity(data.build('candidate', true), baseline),
    /provider\/context differs/
  );
});

test('blocks stale measured declaration versions even when the live redirect is valid', () => {
  const data = fixture();
  const baseline = data.build('stale-version', false, raw => {
    raw.fileInfos[
      raw.fileNames.findIndex(
        path => resolve(dirname(data.root), path) === data.left
      )
    ].version = '0'.repeat(64);
  });
  assert.throws(
    () => data.capture(data.entry(baseline), data.config),
    /certificate binding differs/
  );
});

test('blocks equally wrong raw formats when the live Program formats differ', () => {
  const data = fixture();
  const baseline = data.build('stale-format', false, raw => {
    raw.fileNames.forEach((path, index) => {
      if ([data.left, data.right].includes(resolve(dirname(data.root), path)))
        raw.fileInfos[index].impliedFormat = 99;
    });
  });
  data.capture(data.entry(baseline), data.config);
  assert.throws(
    () => assertGraphParity(data.build('candidate', true), baseline),
    /provider\/context differs/
  );
});

test('binds the complete external population rather than only repository roots', () => {
  const data = fixture(),
    extra = resolve(data.root, 'node_modules/unloaded/index.d.ts');
  save(extra, 'export declare const outside: unique symbol;\n');
  const baseline = data.build('extra-provider', false, raw => {
    const position = raw.fileInfos.length;
    raw.fileNames.splice(position, 0, relative(dirname(data.root), extra));
    raw.fileInfos.push({
      version: sha(readFileSync(extra)),
      affectsGlobalScope: false,
    });
    raw.fileIdsList[0][0]++;
  });
  assert.deepEqual(baseline.rootFiles, ['source.ts']);
  assert.deepEqual(baseline.repositoryFiles, ['source.ts']);
  assert.throws(
    () => data.capture(data.entry(baseline), data.config),
    /certificate binding differs/
  );
});

test('captures a seeded snapshot while held and preserves proof after restoration', async () => {
  const data = fixture();
  const original = readFileSync(data.source, 'utf8');
  const { baseline, candidate, entry, certificate } = await withMutation(
    data.root,
    { 'source.ts': '\nexport const Seeded: string = 42;\n' },
    async () => {
      const baseline = data.build('seeded');
      const candidate = data.build('candidate', true);
      const entry = data.entry(baseline);
      const certificate = data.capture(entry, data.config);
      return { baseline, candidate, entry, certificate };
    }
  );
  assert.ok(certificate);
  assert.ok(baseline);
  assert.ok(candidate);
  assert.ok(entry);
  assert.ok(certificate.sourceFilesSha256);
  assert.equal(readFileSync(data.source, 'utf8'), original);
  assert.throws(
    () => data.capture(entry, data.config),
    /source snapshot changed/
  );
  assert.equal(
    assertGraphParity(candidate, baseline).programRedirects.length,
    1
  );
  baseline.metadata.auxiliary[0].path = data.provider;
  assert.throws(
    () => assertGraphParity(candidate, baseline),
    /linkage|Captured redirect graph changed/
  );
});
