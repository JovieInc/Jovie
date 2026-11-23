import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MANIFEST, runGoldenPathPen } from '../invariants/pen-golden-path.mjs';
import {
  ACCEPTED_SCHEMA,
  applyAccepted,
  extractAccepted,
  formatBiomeJson,
  loadAccepted,
  pointManifest,
  stillNode,
} from './pen-accepted.mjs';

/** @returns {any} */
const canonical = () => ({
  version: '2.21',
  variables: { bg: { value: '#000' } },
  themes: { dark: {} },
  children: [
    { id: 'btn', name: 'Button', x: 0, width: 200, reusable: true },
    { id: 'old', name: 'Sign in', x: 300, width: 1440, children: [] },
  ],
});

const draft = () => {
  const doc = canonical();
  doc.variables = { ...doc.variables, glow: { value: '#f0f' } };
  doc.children.push({
    id: 'claimTop',
    name: 'claim',
    type: 'frame',
    x: 0,
    width: 2000,
    children: [
      {
        id: 'claimDesk',
        type: 'frame',
        width: 1440,
        children: [{ id: 'i1', ref: 'btn' }],
      },
      { id: 'claimMob', type: 'frame', width: 390 },
    ],
  });
  return doc;
};

test('extract keeps the drafted frame, its still node and only what the draft added', () => {
  const record = extractAccepted(draft(), 'claim', {
    viewport: 1440,
    sectionId: 'claim/claim',
    source: 'run 1',
    canonical: canonical(),
  });
  assert.equal(record.schema, ACCEPTED_SCHEMA);
  assert.equal(record.node.id, 'claimTop');
  assert.equal(record.stillNodeId, 'claimDesk');
  assert.deepEqual(record.variables, { glow: { value: '#f0f' } });
  assert.equal(record.themes, undefined, 'no theme was added');
  assert.throws(
    () => extractAccepted(canonical(), 'claim', { viewport: 1440 }),
    /no top-level frame named claim/
  );
});

test('the still node is the frame itself when it already has the viewport width', () => {
  const frame = {
    id: 'a',
    width: 390,
    children: [{ id: 'b', type: 'frame', width: 390 }],
  };
  assert.equal(stillNode(frame, 390).id, 'a');
  assert.equal(stillNode({ id: 'c', width: 10 }, 1440).id, 'c');
});

test('an accepted frame the canonical lacks is spliced in right of everything', () => {
  const record = extractAccepted(draft(), 'claim', {
    viewport: 1440,
    sectionId: 'claim/claim',
    canonical: canonical(),
  });
  const logs = [];
  const { doc, applied, skipped } = applyAccepted(canonical(), [record], l =>
    logs.push(l)
  );
  assert.deepEqual(applied, ['claim']);
  assert.deepEqual(skipped, []);
  const added = doc.children.at(-1);
  assert.equal(added.id, 'claimTop');
  assert.equal(added.x, 300 + 1440 + 400, 'placed right of every frame');
  assert.deepEqual(Object.keys(doc.variables), ['glow', 'bg']);
  assert.deepEqual(logs, [], 'its ref resolves in the canonical');
});

test('the canonical wins over an overlay with the same node id, and a difference is logged', () => {
  const record = extractAccepted(draft(), 'claim', {
    viewport: 1440,
    sectionId: 'claim/claim',
    canonical: canonical(),
  });
  const edited = canonical();
  edited.children.push({ ...record.node, name: 'claim (edited in Pen)' });
  const logs = [];
  const { doc, applied, skipped } = applyAccepted(edited, [record], l =>
    logs.push(l)
  );
  assert.deepEqual(applied, []);
  assert.deepEqual(skipped, [{ frame: 'claim', reason: 'canonical-differs' }]);
  assert.equal(doc.children.at(-1).name, 'claim (edited in Pen)');
  assert.match(logs[0], /differs from the accepted overlay; using canonical/);

  const same = canonical();
  same.children.push(record.node);
  const quiet = [];
  assert.deepEqual(applyAccepted(same, [record], l => quiet.push(l)).skipped, [
    { frame: 'claim', reason: 'same' },
  ]);
  assert.deepEqual(quiet, []);
});

test('a reference the canonical cannot resolve is named', () => {
  const record = extractAccepted(draft(), 'claim', {
    viewport: 1440,
    sectionId: 'claim/claim',
    canonical: canonical(),
  });
  const bare = { children: [] };
  const logs = [];
  applyAccepted(bare, [record], l => logs.push(l));
  assert.match(logs[0], /refers to 1 node\(s\) the canonical lacks: btn/);
});

test('pointManifest sets the section node id and rejects an unknown section', () => {
  const manifest = {
    frames: [{ sectionId: 'claim/claim', penNodeId: 'pending-no-design' }],
  };
  assert.equal(
    pointManifest(manifest, 'claim/claim', 'claimDesk').frames[0].penNodeId,
    'claimDesk'
  );
  assert.throws(
    () => pointManifest(manifest, 'claim/claim', 'pending-x'),
    /not a Pen node id/
  );
  assert.throws(() => pointManifest(manifest, 'nope/nope', 'x'), /no section/);
});

test('the Golden Path export splices accepted frames and keys its cache on them', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pen-accepted-'));
  mkdirSync(join(root, 'docs/pen-stills/golden-path'), { recursive: true });
  writeFileSync(
    join(root, MANIFEST),
    JSON.stringify({
      schema: 'pen-still-manifest/v1',
      penFile: { name: 'canonical.lib.pen' },
      frames: [
        {
          sectionId: 'signup-signin/signin',
          penNodeId: 'old',
          stillPath: 'docs/pen-stills/golden-path/signup-signin.signin.png',
          viewport: 1440,
          mode: 'dark',
          route: '/signin',
          status: 'active',
        },
      ],
    })
  );
  const record = extractAccepted(draft(), 'claim', {
    viewport: 1440,
    sectionId: 'claim/claim',
    canonical: canonical(),
  });
  const keyFor = async accepted => {
    const outputs = {};
    const out = join(root, `out-${accepted.length}`);
    await runGoldenPathPen({
      out,
      root,
      surfaceIds: ['signup-signin'],
      env: {
        PEN_CLI_KEY: 'k',
        PEN_GOLDEN_PATH_FILE_URL: 'https://blob.example/c',
      },
      run: () => assert.fail('fetch-only runs no exporter'),
      fetchImpl: async () => new Response(JSON.stringify(canonical())),
      fetchOnly: true,
      accepted,
      log: () => {},
      report: (name, value) => {
        outputs[name] = value;
      },
    });
    return {
      key: outputs.cache_key,
      pen: JSON.parse(readFileSync(join(out, 'workspace/src.pen'), 'utf8')),
    };
  };
  const plain = await keyFor([]);
  const overlaid = await keyFor([record]);
  assert.notEqual(plain.key, overlaid.key, 'the overlay is part of the key');
  assert.equal(plain.pen.children.length, 2);
  assert.equal(overlaid.pen.children.at(-1).id, 'claimTop');
});

test('loadAccepted reads only accepted records, in name order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-accepted-dir-'));
  const rec = frame => ({
    schema: ACCEPTED_SCHEMA,
    frame,
    node: { id: frame },
  });
  writeFileSync(join(dir, 'b.json'), JSON.stringify(rec('b')));
  writeFileSync(join(dir, 'a.json'), JSON.stringify(rec('a')));
  writeFileSync(join(dir, 'c.json'), JSON.stringify({ schema: 'other' }));
  writeFileSync(join(dir, 'README.md'), 'notes');
  assert.deepEqual(
    loadAccepted(dir).map(r => r.frame),
    ['a', 'b']
  );
  assert.deepEqual(loadAccepted(join(dir, 'missing')), []);
});

test('formatBiomeJson matches biome 2.x JSON formatting (expand: auto)', () => {
  // non-empty objects always expanded, empty containers inline, LF at end
  assert.equal(
    formatBiomeJson({ a: 1, b: {}, c: [], d: { e: 'x' } }),
    '{\n  "a": 1,\n  "b": {},\n  "c": [],\n  "d": {\n    "e": "x"\n  }\n}\n'
  );
  // arrays that fit stay on one line, including nested ones
  assert.equal(
    formatBiomeJson({ a: [1, 'b', null, [true, []]] }),
    '{\n  "a": [1, "b", null, [true, []]]\n}\n'
  );
  // arrays of objects break, one element per line
  assert.equal(
    formatBiomeJson({ a: [{ x: 1 }, { y: [1, 2] }] }),
    '{\n  "a": [\n    {\n      "x": 1\n    },\n    {\n      "y": [1, 2]\n    }\n  ]\n}\n'
  );
  // escapes are JSON.stringify's
  assert.equal(
    formatBiomeJson({ 'k"q': 'a\\b\n' }),
    '{\n  "k\\"q": "a\\\\b\\n"\n}\n'
  );
});

test('formatBiomeJson honours the 80-column limit, trailing comma included', () => {
  // `  "a": [` + str + `]` + comma: the comma counts toward the width
  const fits = (len, comma) => {
    const o = { a: ['x'.repeat(len - 2)] };
    if (comma) o.b = 1;
    return !formatBiomeJson(o).includes('[\n');
  };
  // line = 2 + 5 + 2 + len(+1 for comma) -> len 71 last, 70 with comma
  assert.equal(fits(71, false), true);
  assert.equal(fits(72, false), false);
  assert.equal(fits(70, true), true);
  assert.equal(fits(71, true), false);
});

test('formatBiomeJson fills long number arrays and round-trips', () => {
  const nums = Array.from({ length: 30 }, (_, i) => i * 1000);
  const out = formatBiomeJson({ n: nums });
  const lines = out.split('\n');
  assert.ok(lines.every(l => l.length <= 80));
  assert.ok(lines.length < 30, 'numbers share lines');
  assert.deepEqual(JSON.parse(out), { n: nums });
  const mixed = { a: [[1, 2], [{ b: 'x'.repeat(90) }]], c: [{}], d: [] };
  assert.deepEqual(JSON.parse(formatBiomeJson(mixed)), mixed);
});
