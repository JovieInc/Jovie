import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./lint.mjs', import.meta.url));
const rectangle = (id, props = {}) => ({ type: 'rectangle', id, ...props });
const frame = (id, props = {}) => ({ type: 'frame', id, ...props });
const ref = (id, origin, props = {}) => ({
  type: 'ref',
  id,
  ref: origin,
  ...props,
});
const page = (id, children) => ({ type: 'page', id, children });
const doc = children => ({
  version: '2.26',
  children: [page('main', children)],
});
const digest = path =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

function input(t, document, policy, library) {
  const dir = mkdtempSync(join(tmpdir(), 'jovie-pen-lint-'));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const inFile = join(dir, 'input.pen');
  writeFileSync(
    inFile,
    typeof document === 'string' ? document : JSON.stringify(document)
  );
  const args = [cli, '--', inFile, '--json'];
  if (policy) {
    const policyFile = join(dir, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(policy));
    args.push('--policy', policyFile);
  }
  if (library) {
    const libFile = join(dir, 'standin.lib.pen');
    writeFileSync(libFile, JSON.stringify(library));
    args.push('--library', `ds=${libFile}`);
  }
  const before = digest(inFile);
  const child = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(child.signal, null, child.stderr);
  assert.equal(digest(inFile), before, 'must not mutate a Pen input');
  const output = JSON.parse(child.stdout);
  return {
    status: child.status,
    ...output,
    codes: output.findings.map(f => f.rule),
  };
}

function fixtures() {
  const tabs = {
    type: 'variants',
    id: 'tabs-origin',
    reusable: { size: ['standard', 'compact'] },
    children: [
      frame('standard', { reusable: { size: 'standard' } }),
      frame('compact', {
        reusable: { size: 'compact' },
        children: [{ type: 'text', id: 'label', content: 'Details' }],
      }),
    ],
  };
  const card = frame('card-origin', {
    reusable: true,
    fill: '$surface',
    children: [frame('holder', { slot: ['tabs-origin'] })],
  });
  const panel = frame('rail', {
    layout: 'vertical',
    children: [
      ref('entity', 'card-origin', {
        descendants: { holder: { children: [rectangle('slot-asset')] } },
      }),
      frame('share', { fill: '$share-fill' }),
      ref('tabs', 'tabs-origin', {
        variant: { size: 'compact' },
        descendants: { label: { content: 'Specific details' } },
      }),
    ],
  });
  const proof = doc([
    frame('current', {
      name: 'A working label, not authority',
      children: [panel],
    }),
    frame('before', { name: 'Canonical (old name is not authority)' }),
    frame('variant', { name: 'Canonical (working name)' }),
    card,
    tabs,
  ]);
  proof.variables = {
    surface: { type: 'color', value: '#222222' },
    'share-fill': { type: 'color', value: '$surface' },
  };
  const policy = {
    version: 1,
    penVersion: '2.26',
    surfaces: [
      {
        key: 'identity',
        candidates: [
          { id: 'current', state: 'canonical' },
          { id: 'before', state: 'archive' },
          { id: 'variant', state: 'alternate' },
        ],
        instances: [
          { within: 'rail', node: 'entity', ref: 'card-origin' },
          {
            within: 'rail',
            node: 'tabs',
            ref: 'tabs-origin',
            variant: { size: 'compact' },
          },
        ],
        entityShareTabs: [
          {
            placements: [
              { parent: 'rail', children: ['entity', 'share', 'tabs'] },
            ],
          },
        ],
        bindings: [
          { node: 'entity', property: ['fill'], variable: '$surface' },
          {
            node: 'share',
            property: ['fill'],
            variable: '$surface',
            allowLiterals: ['#111111'],
          },
        ],
      },
    ],
  };
  return { proof, policy, panel };
}

test('valid native slots, local aliases, overrides and approved inactive designs pass', t => {
  const { proof, policy } = fixtures();
  const exact = input(t, proof, policy);
  assert.equal(exact.status, 0);
  assert.deepEqual(exact.findings, []);
});

test('reports duplicate and dangling IDs with a page/frame/node/rule and remediation', t => {
  const result = input(
    t,
    doc([
      frame('f', {
        children: [
          rectangle('repeat'),
          rectangle('repeat'),
          ref('missing', 'not-a-component'),
        ],
      }),
    ])
  );
  assert.equal(result.status, 1);
  assert.deepEqual(result.codes, ['node.duplicate-id', 'instance.missing']);
  assert.deepEqual(
    [
      result.findings[1].page.id,
      result.findings[1].frame.id,
      result.findings[1].node.id,
    ],
    ['main', 'f', 'missing']
  );
  assert.equal(result.findings[1].value.ref, 'not-a-component');
  assert.match(result.findings[1].remediation, /Relink/u);
});

test('an existing detached or lookalike layer and a valid but wrong variant fail', t => {
  const { proof, policy, panel } = fixtures();
  panel.children[0] = frame('entity', {
    name: 'card-origin',
    fill: '$surface',
  });
  panel.children[2] = ref('tabs', 'tabs-origin', {
    variant: { size: 'standard' },
  });
  const result = input(t, proof, policy);
  assert.equal(result.status, 1);
  assert.deepEqual(result.codes, [
    'policy.instance-missing',
    'policy.instance-variant',
  ]);
});

test('rejects invalid native variant, non-origin ref and override into unrelated node', t => {
  const { proof, panel } = fixtures();
  panel.children[0].descendants.variant = { fill: '#FFFFFF' };
  panel.children[2].variant = { size: 'xlarge' };
  panel.children.push(ref('bad', 'before'));
  const r = input(t, proof);
  assert.deepEqual(r.codes, [
    'override.missing',
    'instance.bad-variant',
    'instance.not-origin',
  ]);
});

test('missing declared library is unverified; explicit frozen library verifies v2.17 native namespace and overrides', t => {
  const sample = {
    version: '2.17',
    children: [
      frame('import-card', {
        reusable: true,
        children: [frame('slot', { slot: ['import-btn'] })],
      }),
      frame('import-btn', {
        reusable: true,
        children: [{ type: 'text', id: 'caption', content: 'Button' }],
      }),
    ],
    variables: { ink: { type: 'color', value: '#222222' } },
  };
  const consumer = {
    version: '2.17',
    imports: { ds: 'do-not-auto-open.lib.pen' },
    children: [
      ref('card', 'ds:import-card', {
        descendants: {
          'ds:slot': {
            children: [
              ref('button', 'ds:import-btn', {
                descendants: {
                  'ds:caption': { content: 'Save', fill: '$ds:ink' },
                },
              }),
            ],
          },
        },
      }),
    ],
  };
  const absent = input(t, consumer);
  assert.equal(absent.status, 0);
  assert.equal(absent.summary.error, 0);
  assert.ok(absent.codes.includes('instance.unverified'));
  const present = input(t, consumer, null, sample);
  assert.equal(present.status, 0);
  assert.deepEqual(present.findings, []);
  sample.children.splice(1, 1);
  assert.ok(
    input(t, consumer, null, sample).codes.includes('instance.missing')
  );
});

test('valid nested ref overrides resolve path prefixes instead of global IDs', t => {
  const candidate = doc([
    frame('parent', { reusable: true, children: [ref('nested', 'origin')] }),
    frame('origin', { reusable: true, children: [rectangle('target')] }),
    ref('instance', 'parent', {
      descendants: { 'nested/target': { fill: '#808080' } },
    }),
  ]);
  assert.deepEqual(input(t, candidate).findings, []);
  candidate.children[0].children[2].descendants = {
    target: { fill: '#808080' },
  };
  assert.deepEqual(input(t, candidate).codes, ['override.missing']);
});

test('only explicit canonical lifecycle is counted; archive and intentional alternate remain', t => {
  const { proof, policy } = fixtures();
  proof.children[0].children.push(
    frame('second', {
      metadata: {
        type: 'jovie.design/v1',
        surface: 'identity',
        state: 'canonical',
      },
    })
  );
  assert.deepEqual(input(t, proof, policy).codes, ['policy.canonical-count']);
  proof.children[0].children[5].metadata.state = 'alternate';
  assert.deepEqual(input(t, proof, policy).findings, []);
});

test('rejects wrong structural order; explicit alternate counts; arbitrary geometry is unverified', t => {
  const { proof, policy, panel } = fixtures();
  panel.children.reverse();
  assert.deepEqual(input(t, proof, policy).codes, ['policy.rail-order']);
  panel.layout = 'none';
  assert.deepEqual(input(t, proof, policy).codes, [
    'policy.rail-order-unverified',
  ]);
  const placement = {
    parent: 'native-alt',
    children: ['entity-alt', 'share-alt', 'tabs-alt'],
  };
  proof.children[0].children[0].children.push(
    frame('native-alt', {
      layout: 'vertical',
      children: placement.children.map(id => frame(id)),
    })
  );
  policy.surfaces[0].entityShareTabs[0].placements.push(placement);
  assert.deepEqual(input(t, proof, policy).findings, []);
});

test('allows one explicit literal, preserves unrelated literals and rejects lookalike token values', t => {
  const { proof, policy, panel } = fixtures();
  panel.children[1].fill = '#111111';
  panel.children.push({
    type: 'text',
    id: 'price',
    content: '$12',
    fill: '#333333',
  });
  assert.deepEqual(input(t, proof, policy).findings, []);
  panel.children[1].fill = '#222222'; // same color, but no binding
  assert.deepEqual(input(t, proof, policy).codes, ['policy.binding']);
});

test('distinguishes supported root shapes, incompatibility and structurally empty canvas', t => {
  const legacy = { version: '2.17', children: [frame('root')] };
  assert.deepEqual(input(t, legacy).findings, []);
  assert.deepEqual(input(t, { ...legacy, version: '2.26' }).codes, [
    'format.root',
    'canvas.empty',
  ]);
  assert.deepEqual(
    input(t, { ...doc([frame('root')]), version: '2.17' }).codes,
    ['format.root', 'canvas.empty']
  );
  assert.deepEqual(input(t, doc([])).codes, ['canvas.empty']);
  assert.equal(input(t, { ...legacy, version: '2.29' }).status, 2);
  assert.equal(input(t, '[broken').status, 2);
  assert.equal(
    input(t, legacy, { version: 1, penVersion: '2.26', surfaces: [] }).status,
    1
  );
});

test('malformed override, variable alias cycles and JSON comments are handled deterministically', t => {
  const candidate = doc([
    frame('origin', { reusable: true, fill: '$one' }),
    ref('instance', 'origin', { descendants: { '/empty': 1 } }),
  ]);
  candidate.variables = {
    one: { type: 'color', value: '$two' },
    two: { type: 'color', value: '$one' },
  };
  const jsonc = `/* exported fixture */\n${JSON.stringify(candidate)} // comment`;
  const a = input(t, jsonc);
  assert.ok(a.codes.includes('variable.cycle'));
  assert.ok(a.codes.includes('instance.override'));
  assert.equal(a.status, 1);
  assert.match(
    execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }),
    /does not open Pen|Does not open Pen/u
  );
});

test('a populated structure may be outside the native viewport; its report is not a render receipt', t => {
  const candidate = doc([
    frame('offscreen', {
      x: 9_000_000,
      y: -9_000_000,
      width: 400,
      height: 100,
    }),
  ]);
  const result = input(t, candidate);
  assert.equal(result.status, 0);
  assert.equal(result.mode, 'structural-only');
  assert.deepEqual(result.findings, []);
  assert.ok(!Object.hasOwn(result, 'rendered'));
});
