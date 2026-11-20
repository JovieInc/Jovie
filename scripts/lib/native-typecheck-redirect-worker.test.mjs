import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { collectRedirects } from './native-typecheck-redirect-worker.mjs';

const compilerPath = createRequire(import.meta.url).resolve('typescript');
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

function fixture(kind = 'module') {
  const root = mkdtempSync(resolve(tmpdir(), 'native-redirect-worker-'));
  directories.push(root);
  const widget = name =>
    resolve(root, 'node_modules', name, 'node_modules/widget/index.d.ts');
  const declaration =
    'export declare const identity: unique symbol;\n' +
    'export declare class Widget { private brand; readonly [identity]: 1; }\n';
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
    save(widget(name), declaration);
  }
  const source = resolve(root, 'source.ts');
  save(
    source,
    kind === 'module'
      ? [
          "import type { Widget as A } from 'first';",
          "import type { Widget as B } from 'second';",
          'export type Both = A | B;',
          '',
        ].join('\n')
      : ['first', 'second']
          .map(
            name =>
              `/// <reference ${kind === 'path' ? 'path' : 'types'}="./node_modules/${name}/node_modules/widget${kind === 'path' ? '/index.d.ts' : ''}" />`
          )
          .concat('export {};', '')
          .join('\n')
  );
  const base = resolve(root, 'tsconfig.base.json');
  save(base, {
    compilerOptions: {
      module: 'commonjs',
      moduleResolution: 'node',
      noLib: true,
      types: [],
    },
  });
  const config = resolve(root, 'tsconfig.json');
  save(config, { extends: './tsconfig.base.json', files: ['source.ts'] });
  const input = {
    root,
    config,
    compilerPath,
    sourceFiles: [{ path: 'source.ts', sha256: sha(readFileSync(source)) }],
  };
  return { root, config, base, source, widget, input };
}

test('certifies actual package redirects between distinct nominal declaration copies', () => {
  const data = fixture();
  assert.notEqual(
    statSync(data.widget('first')).ino,
    statSync(data.widget('second')).ino
  );
  const result = collectRedirects(data.input);
  assert.equal(result.redirects.length, 1);
  const redirect = result.redirects[0];
  assert.equal(redirect.left.path, data.widget('second'));
  assert.equal(redirect.right.path, data.widget('first'));
  assert.equal(redirect.left.sha256, redirect.right.sha256);
  assert.deepEqual(
    redirect.inbound.map(item => item.resolvedFileName).sort(),
    [data.widget('first'), data.widget('second')].sort()
  );
  assert.ok(redirect.inbound.every(item => item.kind === 'module'));
  assert.ok(
    redirect.inbound.every(
      item =>
        item.packageId.name === 'widget' && item.packageId.version === '1.0.0'
    )
  );
  assert.deepEqual(
    redirect.inbound[0].packageId,
    redirect.inbound[1].packageId
  );
  assert.deepEqual(result.rootFiles, ['source.ts']);
  assert.deepEqual(result.repositoryFiles, ['source.ts']);
  assert.deepEqual(
    result.semanticFiles,
    [
      data.source,
      data.widget('first'),
      data.widget('second'),
      resolve(data.root, 'node_modules/first/index.d.ts'),
      resolve(data.root, 'node_modules/second/index.d.ts'),
    ].sort()
  );
  assert.deepEqual(
    Object.keys(result.semanticVersions).sort(),
    result.semanticFiles
  );
  for (const path of result.semanticFiles)
    assert.equal(
      result.semanticVersions[path],
      createRequire(import.meta.url)(
        compilerPath
      ).getSourceFileVersionAsHashFromText(
        createRequire(import.meta.url)(compilerPath).sys,
        readFileSync(path, 'utf8')
      )
    );
});

test('binds versions using TS6 source-map normalization rather than raw file hashes', () => {
  const data = fixture();
  const ts = createRequire(import.meta.url)(compilerPath);
  const declaration = readFileSync(data.widget('first'), 'utf8');
  const text = `${declaration}//# sourceMappingURL=widget.d.ts.map\n`;
  for (const name of ['first', 'second']) save(data.widget(name), text);
  const result = collectRedirects(data.input);
  const expected = ts.sys.createHash(declaration);
  assert.notEqual(expected, sha(text));
  assert.equal(result.semanticVersions[data.widget('first')], expected);
  assert.equal(result.semanticVersions[data.widget('second')], expected);
});

test('does not certify equal nominal copies admitted only through path references', () => {
  const data = fixture('path');
  assert.deepEqual(
    readFileSync(data.widget('first')),
    readFileSync(data.widget('second'))
  );
  assert.equal(collectRedirects(data.input).redirects.length, 0);
});

test('captures package redirection admitted through actual type-reference resolution', () => {
  const data = fixture('type');
  const result = collectRedirects(data.input);
  assert.equal(result.redirects.length, 1);
  const redirect = result.redirects[0];
  assert.equal(redirect.inbound.length, 2);
  assert.ok(redirect.inbound.every(item => item.kind === 'type'));
  assert.deepEqual(
    redirect.inbound.map(item => item.resolvedFileName).sort(),
    [data.widget('first'), data.widget('second')].sort()
  );
  assert.deepEqual(
    redirect.inbound[0].packageId,
    redirect.inbound[1].packageId
  );
});

test('records the actual canonical provider for a redirected relative reference', () => {
  const data = fixture();
  for (const name of ['first', 'second']) {
    const index = data.widget(name);
    save(
      index,
      `/// <reference path="./child.d.ts" />\n${readFileSync(index, 'utf8')}`
    );
    save(resolve(dirname(index), 'child.d.ts'), 'export interface Child {}\n');
  }
  const redirect = collectRedirects(data.input).redirects[0];
  assert.deepEqual(redirect.references, [
    {
      kind: 'path',
      name: './child.d.ts',
      leftPath: resolve(dirname(data.widget('second')), 'child.d.ts'),
      canonicalPath: resolve(dirname(data.widget('first')), 'child.d.ts'),
      mode: null,
      packageId: null,
    },
  ]);
});

test('does not merge equal declarations with different effective peer versions', () => {
  const data = fixture();
  for (const [name, version] of [
    ['first', '1.0.0'],
    ['second', '2.0.0'],
  ]) {
    save(resolve(dirname(data.widget(name)), 'package.json'), {
      name: 'widget',
      version: '1.0.0',
      types: 'index.d.ts',
      peerDependencies: { 'peer-lib': '*' },
    });
    save(resolve(dirname(data.widget(name)), '../peer-lib/package.json'), {
      name: 'peer-lib',
      version,
      types: 'index.d.ts',
    });
    save(
      resolve(dirname(data.widget(name)), '../peer-lib/index.d.ts'),
      'export interface Peer {}\n'
    );
  }
  assert.equal(collectRedirects(data.input).redirects.length, 0);
});

test('rejects different effective peer targets with matching version and manifest bytes', () => {
  const data = fixture();
  const peers = [];
  for (const name of ['first', 'second']) {
    save(resolve(dirname(data.widget(name)), 'package.json'), {
      name: 'widget',
      version: '1.0.0',
      types: 'index.d.ts',
      peerDependencies: { 'peer-lib': '*' },
    });
    const peer = resolve(dirname(data.widget(name)), '../peer-lib');
    peers.push(peer);
    save(resolve(peer, 'package.json'), {
      name: 'peer-lib',
      version: '1.0.0',
      types: 'index.d.ts',
    });
    save(
      resolve(peer, 'index.d.ts'),
      `export interface Peer { readonly tag: '${name}' }\n`
    );
  }
  assert.deepEqual(
    readFileSync(resolve(peers[0], 'package.json')),
    readFileSync(resolve(peers[1], 'package.json'))
  );
  assert.notDeepEqual(
    readFileSync(resolve(peers[0], 'index.d.ts')),
    readFileSync(resolve(peers[1], 'index.d.ts'))
  );
  assert.throws(() => collectRedirects(data.input), /effective peer context/iu);
});

test('includes pinned standard libraries in the complete semantic population', () => {
  const data = fixture();
  const base = JSON.parse(readFileSync(data.base, 'utf8'));
  delete base.compilerOptions.noLib;
  save(data.base, base);
  const result = collectRedirects(data.input);
  assert.ok(result.semanticFiles.includes(data.widget('first')));
  assert.ok(result.semanticFiles.includes(data.widget('second')));
  const defaultLibrary = createRequire(import.meta.url)(
    compilerPath
  ).getDefaultLibFilePath({});
  assert.ok(result.semanticFiles.includes(defaultLibrary));
  assert.ok(
    result.semanticFiles.includes(
      resolve(dirname(compilerPath), 'lib.es5.d.ts')
    )
  );
  assert.deepEqual(
    result.semanticFiles,
    [...new Set(result.semanticFiles)].sort()
  );
});

test('binds both the selected configuration and its inherited options', () => {
  const data = fixture();
  const result = collectRedirects(data.input);
  assert.equal(result.config.path, data.config);
  assert.equal(result.config.sha256, sha(readFileSync(data.config)));
  for (const path of [data.config, data.base])
    assert.ok(
      result.config.reads.some(
        item => item.path === path && item.sha256 === sha(readFileSync(path))
      )
    );
  assert.match(result.config.optionsSha256, /^[a-f\d]{64}$/u);
  assert.match(result.sourceFilesSha256, /^[a-f\d]{64}$/u);
});

test('rejects changed unredirected bytes rather than trusting inherited redirect text', () => {
  const data = fixture();
  save(
    data.widget('second'),
    'export declare class Changed { private other; }\n'
  );
  assert.throws(
    () => collectRedirects(data.input),
    /bytes|hash|text|original/iu
  );
});

test('keeps global augmentation redirects blocked', () => {
  const data = fixture();
  for (const name of ['first', 'second'])
    save(
      data.widget(name),
      "export {};\ndeclare global { interface Window { widget: 'value' } }\n"
    );
  assert.throws(() => collectRedirects(data.input), /global/iu);
});

test('rejects a stale repository source fingerprint', () => {
  const data = fixture();
  save(
    data.source,
    `${readFileSync(data.source, 'utf8')}export type Changed = never;\n`
  );
  assert.throws(
    () => collectRedirects(data.input),
    /source|fingerprint|hash/iu
  );
});

test('rejects omitted repository providers in the requested population', () => {
  const data = fixture();
  assert.throws(
    () => collectRedirects({ ...data.input, sourceFiles: [] }),
    /source|population|repository|empty/iu
  );
});
