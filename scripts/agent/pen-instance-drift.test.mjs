// Hermetic tests for the Pen instance-drift snippet: runs it in a vm against a
// small fake of the Pen `execute` API (Get/Print/Replace/Insert/Move/Delete).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const SOURCE = readFileSync(
  new URL('./pen-instance-drift.js', import.meta.url),
  'utf8'
);

function withConfig(config) {
  const replaced = SOURCE.replace(
    /const CONFIG = \{[\s\S]*?\n\};/,
    `const CONFIG = ${JSON.stringify(config)};`
  );
  assert.notEqual(replaced, SOURCE, 'CONFIG block not found');
  return replaced;
}

const clone = value => JSON.parse(JSON.stringify(value));

/** Fake document: one master plus instances. `stale` simulates Pen's cached resolution. */
function makePen() {
  const master = {
    id: 'M',
    type: 'frame',
    reusable: true,
    height: 100,
    children: [
      { id: 'btn', type: 'frame', height: 44 },
      { id: 'title', type: 'text', content: 'Get New Music', height: 20 },
      {
        id: 'prev',
        type: 'frame',
        enabled: false,
        height: 44,
        children: [
          { id: 'prevLabel', type: 'text', content: 'Spotify', height: 17 },
        ],
      },
      {
        id: 'hint',
        type: 'text',
        content: 'Swipe',
        enabled: false,
        height: 15,
      },
    ],
  };
  const doc = [
    master,
    {
      id: 'I1',
      type: 'ref',
      ref: 'M',
      descendants: {},
      stale: { btn: { height: 28 } },
    },
    {
      id: 'I2',
      type: 'ref',
      ref: 'M',
      descendants: { title: { content: 'Jovie changelog' } },
    },
    {
      id: 'I3',
      type: 'ref',
      ref: 'M',
      descendants: { prevLabel: { content: 'Deezer' } },
    },
    {
      id: 'I4',
      type: 'ref',
      ref: 'M',
      descendants: { hint: { content: 'Old hint' } },
    },
    {
      id: 'P',
      type: 'frame',
      descendants: { 'I5/title': { content: 'x' } },
      children: [],
    },
    {
      id: 'I5',
      type: 'ref',
      ref: 'M',
      descendants: {},
      stale: { btn: { height: 28 } },
    },
  ];
  const printed = [];
  const replaced = [];
  let seq = 0;

  const find = id => doc.find(n => n.id === id);
  const resolve = inst => {
    const tree = clone(find(inst.ref));
    const visitNode = node => {
      const patch = {
        ...(inst.stale?.[node.id] || {}),
        ...(inst.descendants?.[node.id] || {}),
      };
      Object.assign(node, patch);
      node.id = `${inst.id}/${node.id}`;
      for (const child of node.children || []) visitNode(child);
    };
    for (const child of tree.children) visitNode(child);
    return { ...inst, children: tree.children };
  };
  const walk = (node, visit, opts, parentCtx, depth, index, out) => {
    const shown =
      opts?.resolveInstances && node.type === 'ref' ? resolve(node) : node;
    const ctx = {
      node: shown,
      parentCtx,
      depth,
      index,
      bounds: {
        x: 0,
        y: 0,
        width: shown.width ?? 100,
        height: shown.height ?? 10,
      },
      skipChildren() {},
    };
    const value = visit(shown, ctx);
    if (value !== undefined) out.push(value);
    (shown.children || []).forEach((child, i) =>
      walk(child, visit, opts, ctx, depth + 1, i, out)
    );
  };
  const Get = (a, b, c) => {
    if (typeof a === 'function') {
      const out = [];
      doc.forEach((n, i) => walk(n, a, b, undefined, 0, i, out));
      return out;
    }
    if (typeof b === 'function') {
      const out = [];
      walk(find(a), b, c, undefined, 0, 0, out);
      return out;
    }
    return clone(find(a));
  };
  const Replace = (id, props) => {
    const i = doc.findIndex(n => n.id === id);
    const nid = `R${++seq}`;
    doc[i] = { ...clone(props), id: nid };
    replaced.push({ from: id, to: nid, descendants: clone(props.descendants) });
    return nid;
  };
  const context = {
    Get,
    Replace,
    Insert: () => assert.fail('Insert not expected for top-level instances'),
    Move: () => {},
    Delete: () => {},
    Print: (...values) => printed.push(values.join(' ')),
  };
  return { context, printed, replaced, doc };
}

const BASE = {
  masters: ['M'],
  mode: 'report',
  fields: ['w', 'h', 'content', 'enabled'],
  ignoreRoot: true,
  stale: {},
  moves: {},
  reenableOrphans: false,
  showOverrides: true,
  maxRows: 50,
};

test('report classifies stale cache, intentional overrides, orphans and retired nodes', () => {
  const pen = makePen();
  vm.runInNewContext(withConfig(BASE), pen.context);
  const out = pen.printed.join('\n');
  assert.match(out, /STALE_CACHE I1 btn h: master=44 inst=28/);
  assert.match(out, /OVERRIDE I2 title content/);
  assert.match(out, /ORPHANED I3 override prevLabel under disabled prev/);
  assert.doesNotMatch(out, /ORPHANED I4/);
  assert.match(out, /"RETIRED":1/);
  assert.equal(pen.replaced.length, 0, 'report mode never writes');
});

test('repair re-instantiates stale and orphaned instances, keeps intentional overrides', () => {
  const pen = makePen();
  vm.runInNewContext(
    withConfig({ ...BASE, mode: 'repair', reenableOrphans: true }),
    pen.context
  );
  const byFrom = Object.fromEntries(pen.replaced.map(r => [r.from, r]));
  assert.deepEqual(byFrom.I1.descendants, {});
  assert.deepEqual(byFrom.I3.descendants, {
    prevLabel: { content: 'Deezer' },
    prev: { enabled: true },
  });
  assert.equal(
    byFrom.I2,
    undefined,
    'an intentional override alone needs no repair'
  );
  assert.equal(
    byFrom.I5,
    undefined,
    'instances addressed by path elsewhere are skipped'
  );
  assert.match(pen.printed.join('\n'), /SKIP I5: nested or referenced/);
});

test('listed stale overrides are dropped and moves relocate fields to the new owner', () => {
  const pen = makePen();
  pen.doc[2].descendants = { title: { content: 'Get Updates', height: 30 } };
  vm.runInNewContext(
    withConfig({
      ...BASE,
      mode: 'repair',
      stale: { M: { title: ['content'] } },
      moves: { M: { title: { to: 'btn', fields: ['height'] } } },
    }),
    pen.context
  );
  const i2 = pen.replaced.find(r => r.from === 'I2');
  assert.deepEqual(i2.descendants, { btn: { height: 30 } });
});

test('before snapshot limits findings to fields the master changed', () => {
  const pen = makePen();
  vm.runInNewContext(withConfig({ ...BASE, mode: 'before' }), pen.context);
  pen.doc[0].children[1].content = 'Get New Music v2';
  pen.printed.length = 0;
  const second = { ...pen.context, __penDrift: pen.context.__penDrift };
  vm.runInNewContext(withConfig({ ...BASE, showOverrides: true }), second);
  const out = pen.printed.join('\n');
  assert.match(out, /OVERRIDE I2 title content/);
  assert.doesNotMatch(
    out,
    /STALE_CACHE I1 btn/,
    'btn did not change in the master'
  );
});
