import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { readRows } from './design-loop-ledger.mjs';
import {
  BINDINGS_PATH,
  loadBindings,
  REPO_ROOT,
  routeState,
  sha256File,
  validateBindings,
} from './pen-bindings-lib.mjs';
import {
  approveRoute,
  exportRoute,
  main,
  parseSection,
  pngWidth,
} from './pen-export.mjs';

/** Minimal PNG-shaped buffer: signature + IHDR with the width; `seed` makes the hash differ. */
function fakePng(width, seed = 'a') {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(100, 20);
  return Buffer.concat([b, Buffer.from(seed)]);
}

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'pen-export-'));
  mkdirSync(join(root, dirname(BINDINGS_PATH)), { recursive: true });
  copyFileSync(join(REPO_ROOT, BINDINGS_PATH), join(root, BINDINGS_PATH));
  const penFile = join(root, 'Home review.pen');
  writeFileSync(penFile, 'not a real pen file');
  const calls = [];
  let seed = 'a';
  const exporter = ({ penFile: f, nodeId, viewport, outPath }) => {
    calls.push({ f, nodeId, viewport });
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, fakePng(Number(viewport), `${seed}${nodeId}`));
  };
  return {
    root,
    penFile,
    calls,
    exporter,
    setSeed: s => {
      seed = s;
    },
  };
}

const SECTIONS = [
  parseSection('hero=1440:H1,390:H2'),
  parseSection('proof=1440:P1,390:P2'),
];

test('parseSection handles explicit viewports, bare ids and bad input', () => {
  assert.deepEqual(parseSection('hero=1440:A,390:B'), {
    section: 'hero',
    frames: [
      { viewport: '1440', nodeId: 'A' },
      { viewport: '390', nodeId: 'B' },
    ],
  });
  assert.deepEqual(parseSection('hero=A').frames, [
    { viewport: '1440', nodeId: 'A' },
  ]);
  assert.throws(() => parseSection('hero'), /name=/);
  assert.throws(() => parseSection('hero=800:A'), /viewport/);
  assert.equal(pngWidth(fakePng(390)), 390);
  assert.throws(() => pngWidth(Buffer.from('nope')), /not a PNG/);
});

test('export writes stills, hashes them and updates the manifest, without approving', () => {
  const s = sandbox();
  const r = exportRoute({
    root: s.root,
    route: '/',
    penFile: s.penFile,
    sections: SECTIONS,
    exporter: s.exporter,
  });
  assert.equal(r.exported, 4);
  assert.equal(r.state, 'unbound', 'export alone never approves');
  const doc = loadBindings(s.root);
  const home = doc.routes['/'];
  assert.equal(home.approved, undefined);
  assert.equal(home.enforce, false, 'export never enforces');
  assert.deepEqual(
    home.viewports['1440'].map(f => f.section),
    ['hero', 'proof']
  );
  const hero = home.viewports['1440'][0];
  assert.equal(hero.still, 'docs/pen-stills/home/1440/hero.png');
  assert.equal(hero.nodeId, 'H1');
  assert.equal(hero.penFile, 'Home review.pen');
  assert.equal(hero.sha256, sha256File(join(s.root, hero.still)));
  assert.equal(home.viewports['390'][0].nodeId, 'H2');
  assert.ok(!existsSync(join(s.root, `${hero.still}.next`)));
  assert.deepEqual(validateBindings(doc, { root: null }), []);
  assert.equal(
    readFileSync(s.penFile, 'utf8'),
    'not a real pen file',
    'the .pen file is untouched'
  );
});

test('approve records the supplied receipt and refuses to invent one', () => {
  const s = sandbox();
  exportRoute({
    root: s.root,
    route: '/',
    penFile: s.penFile,
    sections: SECTIONS,
    exporter: s.exporter,
  });
  assert.throws(
    () => approveRoute({ root: s.root, route: '/', by: 'tim' }),
    /receipt is required/
  );
  assert.throws(
    () => approveRoute({ root: s.root, route: '/', receipt: 'r1' }),
    /by is required/
  );
  assert.throws(
    () =>
      approveRoute({
        root: s.root,
        route: '/pricing',
        by: 'tim',
        receipt: 'r1',
      }),
    /no 1440 stills/
  );
  // approve checks the stills against the files, via git ls-files for sources: only hashes matter here
  const res = approveRoute({
    root: s.root,
    route: '/',
    by: 'tim',
    receipt: 'https://linear.app/jovie/comment/abc',
    at: '2026-11-07T20:00:00Z',
  });
  assert.deepEqual(res.approved, {
    by: 'tim',
    at: '2026-11-07T20:00:00.000Z',
    receipt: 'https://linear.app/jovie/comment/abc',
  });
  assert.equal(routeState(loadBindings(s.root).routes['/']), 'bound');
  assert.equal(
    loadBindings(s.root).routes['/'].enforce,
    true,
    'approve turns enforcement on'
  );
});

test('re-exporting identical pixels keeps the approval; changed pixels clear it', () => {
  const s = sandbox();
  exportRoute({
    root: s.root,
    route: '/',
    penFile: s.penFile,
    sections: SECTIONS,
    exporter: s.exporter,
  });
  approveRoute({ root: s.root, route: '/', by: 'tim', receipt: 'r1' });
  const same = exportRoute({
    root: s.root,
    route: '/',
    penFile: s.penFile,
    sections: SECTIONS,
    exporter: s.exporter,
  });
  assert.equal(same.changed, false);
  assert.equal(same.clearedApproval, false);
  assert.ok(loadBindings(s.root).routes['/'].approved);
  s.setSeed('b');
  const diff = exportRoute({
    root: s.root,
    route: '/',
    penFile: s.penFile,
    sections: SECTIONS,
    exporter: s.exporter,
  });
  assert.equal(diff.changed, true);
  assert.equal(diff.clearedApproval, true);
  assert.equal(loadBindings(s.root).routes['/'].approved, undefined);
  assert.equal(
    loadBindings(s.root).routes['/'].enforce,
    false,
    'new pixels switch enforcement off until re-approved'
  );
});

test('export refuses a wrong-width frame, an oversize still, an unknown route and a missing file, leaving the manifest alone', () => {
  const s = sandbox();
  const before = readFileSync(join(s.root, BINDINGS_PATH), 'utf8');
  const wide = ({ outPath }) => writeFileSync(outPath, fakePng(2880));
  assert.throws(
    () =>
      exportRoute({
        root: s.root,
        route: '/',
        penFile: s.penFile,
        sections: SECTIONS,
        exporter: wide,
      }),
    /expected 1440px/
  );
  assert.throws(
    () =>
      exportRoute({
        root: s.root,
        route: '/',
        penFile: s.penFile,
        sections: SECTIONS,
        exporter: s.exporter,
        maxBytes: 10,
      }),
    /budget/
  );
  assert.throws(
    () =>
      exportRoute({
        root: s.root,
        route: '/nope',
        penFile: s.penFile,
        sections: SECTIONS,
        exporter: s.exporter,
      }),
    /not in/
  );
  assert.throws(
    () =>
      exportRoute({
        root: s.root,
        route: '/',
        penFile: join(s.root, 'missing.pen'),
        sections: SECTIONS,
        exporter: s.exporter,
      }),
    /not found/
  );
  const silent = () => {};
  assert.throws(
    () =>
      exportRoute({
        root: s.root,
        route: '/',
        penFile: s.penFile,
        sections: SECTIONS,
        exporter: silent,
      }),
    /wrote no file/
  );
  assert.equal(readFileSync(join(s.root, BINDINGS_PATH), 'utf8'), before);
  assert.ok(
    !existsSync(join(s.root, 'docs/pen-stills/home/1440/hero.png.next'))
  );
});

test('CLI export then approve, with ledger rows for the loop', () => {
  const s = sandbox();
  const out = [];
  const err = [];
  const io = {
    root: s.root,
    exporter: s.exporter,
    out: m => out.push(m),
    err: m => err.push(m),
  };
  assert.equal(
    main(
      [
        '--route',
        '/',
        '--file',
        s.penFile,
        '--section',
        'hero=1440:H1,390:H2',
        '--loop',
        'home-20261107',
      ],
      io
    ),
    0,
    err.join('\n')
  );
  assert.equal(
    main(
      [
        'approve',
        '--route',
        '/',
        '--by',
        'tim',
        '--receipt',
        'iMessage-thumbs-up-2026-11-07',
        '--loop',
        'home-20261107',
        '--entered',
        '2026-11-07T19:00:00Z',
      ],
      io
    ),
    0,
    err.join('\n')
  );
  const rows = readRows({ root: s.root });
  assert.deepEqual(
    rows.map(r => r.stage),
    ['export', 'approved']
  );
  assert.ok(
    rows.every(
      r => r.loopId === 'home-20261107' && r.entityType === 'design-loop'
    )
  );
  assert.equal(main(['approve', '--route', '/', '--by', 'tim'], io), 1);
  assert.match(err.join('\n'), /receipt is required/);
  assert.equal(main(['--route', '/'], io), 1);
});
