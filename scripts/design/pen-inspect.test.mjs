import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  inspectProgram,
  parseOutput,
  runInspect,
  shellScript,
} from './pen-inspect.mjs';

test('program finds matching frames, dumps their trees and exports them', () => {
  const nodes = [
    {
      id: 'A',
      type: 'frame',
      name: 'Auth / Sign in',
      w: 1440,
      kids: [
        { id: 'A/t', type: 'text', name: 'Title', content: 'Log in', w: 200 },
      ],
    },
    { id: 'B', type: 'frame', name: 'Pricing', w: 1440, kids: [] },
    { id: 'C', type: 'frame', name: 'sign in icon', w: 24, kids: [] },
  ];
  const printed = [];
  let exported = null;
  const walk = (list, fn, depth) => {
    for (const n of list) {
      let skip = false;
      fn(n, {
        depth,
        bounds: { x: 0, y: 0, width: n.w, height: 100 },
        skipChildren: () => {
          skip = true;
        },
      });
      if (!skip) walk(n.kids ?? [], fn, depth + 1);
    }
  };
  const Get = (a, b) => {
    if (typeof a === 'function') return walk(nodes, a, 0);
    walk([nodes.find(n => n.id === a)], b, 0);
  };
  vm.runInNewContext(inspectProgram('sign ?in', '/tmp/png'), {
    Get,
    Print: line => printed.push(line),
    Export: (ids, kind, dir) => {
      exported = { ids, kind, dir };
    },
  });
  const parsed = parseOutput(printed.join('\n'));
  assert.deepEqual(
    parsed.hits.map(h => h.id),
    ['A']
  );
  assert.equal(parsed.trees[0].rows.length, 2);
  assert.equal(parsed.trees[0].rows[1].content, 'Log in');
  assert.deepEqual(JSON.parse(JSON.stringify(exported)), {
    ids: ['A'],
    kind: 'png',
    dir: '/tmp/png',
  });
  assert.equal(parsed.top.length, 3);
});

test('shell script is one execute call and an exit', () => {
  const script = shellScript('Print("it\'s")');
  assert.match(
    script,
    /^execute\(\{"input":"Print\(\\"it's\\"\)"\}\)\nexit\(\)\n$/
  );
});

test('parseOutput skips a truncated line', () => {
  const parsed = parseOutput(
    'PEN_INSPECT_HIT {"id":"x"}\nPEN_INSPECT_HIT {"id":'
  );
  assert.deepEqual(parsed.hits, [{ id: 'x' }]);
});

test('without secrets it inspects nothing and says so', async () => {
  const out = mkdtempSync(join(tmpdir(), 'pen-inspect-'));
  const lines = [];
  const result = await runInspect({
    out,
    query: 'auth',
    env: {},
    log: l => {
      lines.push(l);
    },
  });
  assert.deepEqual(result.skipped, ['PEN_CLI_KEY', 'PEN_GOLDEN_PATH_FILE_URL']);
  assert.match(lines[0], /skipped/);
  assert.deepEqual(
    JSON.parse(readFileSync(join(out, 'inspect.json'), 'utf8')).files,
    []
  );
});

test('echoFrames prints chosen frames in chunks', async () => {
  const { echoFrames } = await import('./pen-inspect.mjs');
  const { mkdtempSync: mk, writeFileSync } = await import('node:fs');
  const dir = mk(join(tmpdir(), 'pen-echo-'));
  writeFileSync(join(dir, 'A.png'), Buffer.alloc(30, 1));
  const lines = [];
  echoFrames({
    parsed: {
      hits: [
        { id: 'A', name: 'Sign in' },
        { id: 'B', name: 'Pricing' },
      ],
      trees: [{ id: 'A', rows: [] }],
    },
    pngDir: dir,
    pattern: 'sign',
    chunk: 16,
    log: l => {
      lines.push(l);
    },
  });
  assert.ok(lines.some(l => l.startsWith('PEN_TREE_JSON A 1/')));
  const png = lines.filter(l => l.startsWith('PEN_PNG_B64 A '));
  assert.equal(png.length, 3);
  assert.ok(!lines.some(l => l.includes(' B ')));
});
