import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { PEN_CLI_VERSION } from './pen-draft.mjs';
import {
  draftedFrameNode,
  PICTURE_PREFIX,
  parsePicture,
  pictureProgram,
  pictureScale,
  planFrames,
  renderDrafts,
} from './pen-draft-picture.mjs';

/** A draft: the canonical frames plus the new top-level frame. */
const draftDoc = (frame, id = 'drafted') => ({
  children: [
    { type: 'frame', id: 'canon-1', name: 'Golden Path' },
    { type: 'frame', id: 'canon-2', name: 'pricing' },
    { type: 'frame', id, name: frame },
  ],
});

function artifacts(frames) {
  const dir = mkdtempSync(join(tmpdir(), 'pen-draft-picture-'));
  for (const [artifact, files] of Object.entries(frames)) {
    mkdirSync(join(dir, artifact), { recursive: true });
    for (const [name, body] of Object.entries(files))
      writeFileSync(join(dir, artifact, name), body);
  }
  return dir;
}

const CANONICAL = JSON.stringify({ children: [{ id: 'canon-1' }] });
const env = {
  PEN_CLI_KEY: 'test-key',
  PEN_GOLDEN_PATH_FILE_URL: 'https://pen.example.test/file',
};
/** @type {any} */
const fetchCanonical = async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new TextEncoder().encode(CANONICAL).buffer,
});

/**
 * A fake Pen CLI: reads the program, "exports" the node it names, and prints
 * what the real editor would. `bounds` gives each node's size.
 */
function fakePen({ bounds = {}, fail = [] } = {}) {
  const sessions = [];
  const run = (cmd, args, opts) => {
    const pen = args[args.indexOf('--in') + 1];
    const program = JSON.parse(opts.input.match(/^execute\((.*)\)$/m)[1]).input;
    const id = JSON.parse(program.match(/const id = (".*?");/)[1]);
    const pngDir = JSON.parse(program.match(/const dir = (".*?");/)[1]);
    sessions.push({
      cmd,
      args,
      cwd: opts.cwd,
      key: opts.env.PEN_CLI_KEY,
      id,
      program,
      // The draft sits beside the canonical file while pen has it open.
      besideCanonical: readdirSync(dirname(pen)).sort(),
      doc: JSON.parse(readFileSync(pen, 'utf8')),
    });
    if (fail.includes(id))
      throw new Error('spawnSync npx ETIMEDOUT\nsecond line');
    const doc = JSON.parse(readFileSync(pen, 'utf8'));
    const {
      w = 1440,
      h = 900,
      name = doc.children.find(child => child.id === id)?.name,
    } = bounds[id] ?? {};
    const scale = pictureScale(w, h);
    writeFileSync(join(pngDir, `${id}.png`), `png of ${id} at ${scale}`);
    return `noise\n${PICTURE_PREFIX}${JSON.stringify({ id, name, w, h, scale })}\nbye\n`;
  };
  return { run, sessions };
}

const render = (dir, pen, extra = {}) =>
  renderDrafts({
    dir,
    env,
    fetchImpl: fetchCanonical,
    run: pen.run,
    log: () => {},
    ...extra,
  });

const sidecar = (dir, frame) =>
  JSON.parse(
    readFileSync(join(dir, `pen-draft-${frame}`, `${frame}.frame.json`), 'utf8')
  );

test('the drafted frame is the top-level node named for the brief', () => {
  assert.deepEqual(draftedFrameNode(draftDoc('claim'), 'claim'), {
    id: 'drafted',
    name: 'claim',
  });
  // A redraft beside an older frame of the same name: the newest one wins.
  const twice = draftDoc('claim', 'older');
  twice.children.push({ type: 'frame', id: 'newer', name: 'claim' });
  assert.equal(draftedFrameNode(twice, 'claim').id, 'newer');
  // Never a nested node, another frame, or a document that is not one.
  assert.equal(draftedFrameNode(draftDoc('claim'), 'homepage'), null);
  assert.equal(
    draftedFrameNode(
      {
        children: [
          { id: 'a', name: 'x', children: [{ id: 'b', name: 'claim' }] },
        ],
      },
      'claim'
    ),
    null
  );
  assert.equal(
    draftedFrameNode({ children: [{ name: 'claim' }] }, 'claim'),
    null
  );
  assert.equal(draftedFrameNode(null, 'claim'), null);
});

test('a frame renders at its own size, shrunk only when a side passes 3600px', () => {
  assert.equal(pictureScale(1440, 900), 1);
  assert.equal(pictureScale(390, 844), 1);
  assert.equal(pictureScale(3600, 1200), 1);
  // Four desktop states side by side: 6000 wide comes out 3600 wide.
  assert.equal(pictureScale(6000, 900), 0.6);
  assert.equal(pictureScale(1440, 9000), 0.4);
  // The whole canvas could never come out over the publisher's 4000px limit.
  assert.ok(8192 * pictureScale(8192, 7900) <= 3600);
  assert.equal(pictureScale(0, 0), 1);
  assert.equal(pictureScale(undefined, undefined), 1);
});

test('the Pen program exports exactly the drafted node', () => {
  const program = pictureProgram('n"1', '/work/out dir');
  assert.match(program, /const id = "n\\"1";/);
  assert.match(program, /const dir = "\/work\/out dir";/);
  // One node in the export list, never the document or every top frame.
  assert.match(program, /Export\(\[id\], 'png', dir, \{ scale \}\);/);
  assert.equal(program.match(/Export\(/g).length, 1);
  assert.match(program, /c\.skipChildren\(\)/);
  assert.deepEqual(
    parsePicture(
      `x\n${PICTURE_PREFIX}{"id":"a","name":"claim","w":1440,"h":900,"scale":1}\ny`
    ),
    { id: 'a', name: 'claim', w: 1440, h: 900, scale: 1 }
  );
  assert.equal(parsePicture(`${PICTURE_PREFIX}{"id":`), null);
  assert.equal(parsePicture('nothing tagged'), null);
});

test('each draft with a .pen gets a picture of its frame alone', async () => {
  const dir = artifacts({
    'pen-draft-claim': {
      'claim.pen': JSON.stringify(draftDoc('claim', 'claim-node')),
      'claim.png': 'the whole canvas',
    },
    'pen-draft-insights': {
      'insights.pen': JSON.stringify(draftDoc('insights', 'insights-node')),
    },
    // A draft that failed left no .pen: nothing to render, no sidecar.
    'pen-draft-homepage': { 'receipt.json': '{}' },
    'coverage-report': { 'claim.pen': '{}' },
  });
  const pen = fakePen({
    bounds: {
      'claim-node': { w: 1440, h: 2200, name: 'claim' },
      'insights-node': { w: 6000, h: 900, name: 'insights' },
    },
  });
  // Only a draft that left a .pen gets a render job.
  assert.deepEqual(planFrames(dir), ['claim', 'insights']);
  assert.deepEqual(planFrames(join(dir, 'missing')), []);
  const result = await render(dir, pen);
  assert.deepEqual(result, [
    { frame: 'claim', ok: true },
    { frame: 'insights', ok: true },
  ]);
  assert.deepEqual(
    pen.sessions.map(session => session.id),
    ['claim-node', 'insights-node']
  );
  const [claim] = pen.sessions;
  assert.equal(claim.cmd, 'npx');
  assert.deepEqual(claim.args.slice(0, 4), [
    '-y',
    `@pen.dev/cli@${PEN_CLI_VERSION}`,
    'interactive',
    '--in',
  ]);
  // Pen opens the draft itself, from the canonical folder so assets resolve.
  assert.deepEqual(claim.doc, draftDoc('claim', 'claim-node'));
  assert.equal(claim.cwd, dirname(claim.args[4]));
  assert.ok(claim.besideCanonical.includes('canonical.pen'));
  assert.equal(claim.key, 'test-key');
  // The throwaway --out is never one of the artifacts.
  assert.equal(
    claim.args[claim.args.indexOf('--out') + 1].startsWith(dir),
    false
  );

  assert.equal(
    readFileSync(join(dir, 'pen-draft-claim/claim.frame.png'), 'utf8'),
    'png of claim-node at 1'
  );
  assert.deepEqual(sidecar(dir, 'claim'), {
    schema: 'jovie.pen-draft-picture/v1',
    frame: 'claim',
    ok: true,
    nodes: [{ id: 'claim-node', name: 'claim', width: 1440, height: 2200 }],
    scale: 1,
  });
  assert.equal(
    readFileSync(join(dir, 'pen-draft-insights/insights.frame.png'), 'utf8'),
    'png of insights-node at 0.6'
  );
  assert.equal(sidecar(dir, 'insights').scale, 0.6);
  // The draft's own export and .pen are left as they were.
  assert.equal(
    readFileSync(join(dir, 'pen-draft-claim/claim.png'), 'utf8'),
    'the whole canvas'
  );
  assert.equal(
    existsSync(join(dir, 'pen-draft-homepage/homepage.frame.json')),
    false
  );
  assert.equal(
    existsSync(join(dir, 'coverage-report/claim.frame.json')),
    false
  );
});

test('a render that fails says so in the sidecar, and the others still render', async () => {
  const dir = artifacts({
    'pen-draft-claim': {
      'claim.pen': JSON.stringify(draftDoc('claim', 'claim-node')),
    },
    'pen-draft-homepage': {
      'homepage.pen': JSON.stringify(draftDoc('homepage', 'home-node')),
    },
    'pen-draft-insights': {
      'insights.pen': JSON.stringify(draftDoc('pricing')),
    },
    'pen-draft-workspace-table': { 'workspace-table.pen': '{ not json' },
    'pen-draft-request-access': {
      'request-access.pen': JSON.stringify(
        draftDoc('request-access', 'ra-node')
      ),
    },
  });
  const pen = fakePen({
    fail: ['claim-node'],
    // Pen reports a different node than the one asked for.
    bounds: { 'ra-node': { name: 'Golden Path' } },
  });
  const result = await render(dir, pen);
  assert.deepEqual(
    result.map(row => [row.frame, row.ok, row.error ?? null]),
    [
      ['claim', false, 'spawnSync npx ETIMEDOUT'],
      ['homepage', true, null],
      ['insights', false, 'the draft has no top-level frame insights'],
      ['request-access', false, 'pen drew Golden Path, not request-access'],
      ['workspace-table', false, 'the draft is not a Pen file'],
    ]
  );
  assert.deepEqual(sidecar(dir, 'claim'), {
    schema: 'jovie.pen-draft-picture/v1',
    frame: 'claim',
    ok: false,
    error: 'spawnSync npx ETIMEDOUT',
  });
  assert.equal(existsSync(join(dir, 'pen-draft-claim/claim.frame.png')), false);
  assert.equal(
    existsSync(join(dir, 'pen-draft-request-access/request-access.frame.png')),
    false
  );
  assert.equal(sidecar(dir, 'homepage').ok, true);
});

test('without the Pen secrets every draft is marked failed and Pen is never run', async () => {
  const dir = artifacts({
    'pen-draft-claim': { 'claim.pen': JSON.stringify(draftDoc('claim')) },
  });
  const pen = fakePen();
  const result = await render(dir, pen, { env: { PEN_CLI_KEY: 'test-key' } });
  assert.deepEqual(result, [
    { frame: 'claim', ok: false, error: 'missing PEN_GOLDEN_PATH_FILE_URL' },
  ]);
  assert.equal(sidecar(dir, 'claim').ok, false);
  assert.deepEqual(pen.sessions, []);
  // A canonical download that fails is named by status, never by its URL.
  const down = await render(dir, pen, {
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  assert.deepEqual(down, [
    { frame: 'claim', ok: false, error: 'canonical Pen file: HTTP 403' },
  ]);
  assert.equal(
    JSON.stringify(sidecar(dir, 'claim')).includes('pen.example.test'),
    false
  );
  // No drafts at all: nothing to do, and no download.
  assert.deepEqual(
    await render(join(dir, 'missing'), pen, {
      fetchImpl: async () => {
        throw new Error('must not download');
      },
    }),
    []
  );
  assert.equal(basename(dir).startsWith('pen-draft-picture-'), true);
});
