import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  designedFrames,
  exportScript,
  findExport,
  MANIFEST,
  runGoldenPathPen,
} from './pen-golden-path.mjs';

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'pen-gp-'));
  mkdirSync(join(root, 'docs/pen-stills/golden-path'), { recursive: true });
  const frame = (sectionId, penNodeId) => ({
    sectionId,
    penNodeId,
    fileHash: null,
    stillPath: `docs/pen-stills/golden-path/${sectionId.replace('/', '.')}.png`,
    viewport: 1440,
    mode: 'dark',
    status: 'active',
  });
  writeFileSync(
    join(root, MANIFEST),
    JSON.stringify({
      penFile: { name: 'canonical.lib.pen' },
      frames: [
        frame('signup-signin/signin', 'oaz9c'),
        frame('signup-signin/request-access', 'pending-no-design'),
        frame('checkout/pricing', 'hLRZB'),
      ],
    })
  );
  return root;
}

test('the committed Golden Path manifest lists every certified surface', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const surfaces = new Set(manifest.frames.map(f => f.sectionId.split('/')[0]));
  for (const surface of [
    'landing',
    'signup-signin',
    'claim',
    'onboarding',
    'chat',
    'public-profile',
    'smartlink',
    'checkout',
  ]) {
    assert.ok(surfaces.has(surface), `${surface} has no Pen frame row`);
  }
});

test('only frames with a real Pen node id are exported', () => {
  const manifest = JSON.parse(
    readFileSync(join(fixtureRoot(), MANIFEST), 'utf8')
  );
  assert.deepEqual(
    designedFrames(manifest).map(f => f.penNodeId),
    ['oaz9c', 'hLRZB']
  );
  assert.match(
    exportScript(['oaz9c'], '/o'),
    /Export\(\["oaz9c"\], "png", "\/o"\)/u
  );
  assert.match(exportScript(['oaz9c'], '/o'), /\nexit\(\)\n$/u);
});

test('without the Pen key or file it exports nothing and says why', async () => {
  const root = fixtureRoot();
  const lines = [];
  const result = await runGoldenPathPen({
    out: join(root, 'out'),
    root,
    env: {},
    run: () => assert.fail('nothing may run'),
    log: line => lines.push(line),
  });
  assert.deepEqual(result.skipped, ['PEN_CLI_KEY', 'PEN_GOLDEN_PATH_FILE_URL']);
  assert.ok(
    lines.some(l => l.includes('no Pen design: signup-signin/request-access'))
  );
});

test('exports headless, copies stills into place and runs the strict diff', async () => {
  const root = fixtureRoot();
  const out = join(root, 'out');
  const calls = [];
  const run = (cmd, args, opts = {}) => {
    calls.push([cmd, ...args]);
    if (args.includes('interactive')) {
      assert.match(opts.input, /Export\(\["oaz9c","hLRZB"\]/u);
      // Pen exported only one of the two: the other must be reported missing.
      writeFileSync(join(out, 'png', 'oaz9c.png'), 'png-bytes');
    }
    return Buffer.from('');
  };
  const lines = [];
  const result = await runGoldenPathPen({
    out,
    root,
    env: {
      PEN_CLI_KEY: 'k',
      PEN_GOLDEN_PATH_FILE_URL: 'https://blob.example/x.pen',
    },
    run,
    fetchImpl: async () => new Response('{"version":"2.20"}'),
    log: line => lines.push(line),
  });
  assert.equal(result.exported.length, 1);
  assert.ok(
    existsSync(
      join(root, 'docs/pen-stills/golden-path/signup-signin.signin.png')
    )
  );
  assert.ok(
    lines.some(l => l.includes('Pen export missing: checkout/pricing'))
  );
  const diff = calls.find(c =>
    c.includes('scripts/invariants/pen-still-diff.mjs')
  );
  assert.ok(diff?.includes('--strict'), 'the diff runs strict');
  assert.ok(diff?.includes('https://jov.ie'));
  assert.equal(findExport(join(out, 'png'), 'nope'), null);
});
