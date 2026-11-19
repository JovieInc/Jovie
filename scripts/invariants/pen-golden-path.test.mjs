import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  designedFrames,
  EXPORT_KEY_FILE,
  exportCacheKey,
  exportGroups,
  exportScript,
  findExport,
  MANIFEST,
  PEN_CLI_VERSION,
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

test('a frame with its own penFile exports from that file in the archive', async () => {
  const root = fixtureRoot();
  const manifestPath = join(root, MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.frames[2].penFile = 'homepage.pen';
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const out = join(root, 'out');
  const opened = [];
  const run = (cmd, args, opts = {}) => {
    if (cmd === 'tar') {
      const dir = args[args.indexOf('-C') + 1];
      for (const name of ['canonical.lib.pen', 'homepage.pen'])
        writeFileSync(join(dir, name), '{}');
    }
    if (args.includes('interactive')) {
      opened.push([
        args[args.indexOf('--in') + 1].split('/').pop(),
        opts.input,
      ]);
    }
    return Buffer.from('');
  };
  await runGoldenPathPen({
    out,
    root,
    env: { PEN_CLI_KEY: 'k', PEN_GOLDEN_PATH_FILE_URL: 'https://r2.example/w' },
    run,
    fetchImpl: async () => new Response(new Uint8Array([0x1f, 0x8b, 0])),
    log: () => {},
  });
  assert.deepEqual(
    opened.map(([file]) => file),
    ['canonical.lib.pen', 'homepage.pen']
  );
  assert.match(opened[0][1], /Export\(\["oaz9c"\]/u);
  assert.match(opened[1][1], /Export\(\["hLRZB"\]/u);
});

// JOV-12639: the export is cached by what was downloaded, never by the URL.
function exportingRun(out, calls) {
  return (cmd, args, opts = {}) => {
    calls.push([cmd, ...args]);
    if (args.includes('interactive')) {
      for (const id of ['oaz9c', 'hLRZB'])
        writeFileSync(join(out, 'png', `${id}.png`), `png-${id}`);
    }
    return Buffer.from('');
  };
}
const penEnv = url => ({ PEN_CLI_KEY: 'k', PEN_GOLDEN_PATH_FILE_URL: url });
const penSource = body => async () => new Response(body);

test('the export cache key follows content, exporter and selection, not the URL', async () => {
  const groups = [{ penFile: 'a.pen', nodeIds: ['oaz9c'] }];
  const sha = 'a'.repeat(64);
  const key = exportCacheKey({ contentSha256: sha, groups });
  assert.ok(key.includes(`cli${PEN_CLI_VERSION}`));
  assert.ok(key.endsWith(`src${sha}`));
  assert.equal(key, exportCacheKey({ contentSha256: sha, groups }));
  assert.notEqual(
    key,
    exportCacheKey({ contentSha256: 'b'.repeat(64), groups })
  );
  assert.notEqual(
    key,
    exportCacheKey({
      contentSha256: sha,
      groups: [{ penFile: 'a.pen', nodeIds: ['hLRZB'] }],
    })
  );
  assert.throws(() => exportCacheKey({ contentSha256: 'url', groups }));

  const root = fixtureRoot();
  const keys = [];
  for (const [url, body] of [
    ['https://blob.example/one', '{"v":1}'],
    ['https://blob.example/two', '{"v":1}'],
    ['https://blob.example/one', '{"v":2}'],
  ]) {
    const outputs = {};
    await runGoldenPathPen({
      out: join(root, `out-${keys.length}`),
      root,
      env: penEnv(url),
      run: () => assert.fail('fetch-only runs no exporter'),
      fetchImpl: penSource(body),
      fetchOnly: true,
      log: () => {},
      report: (name, value) => {
        outputs[name] = value;
      },
    });
    keys.push(outputs.cache_key);
  }
  assert.equal(keys[0], keys[1], 'same bytes at another URL: same key');
  assert.notEqual(keys[0], keys[2], 'new bytes at the same URL: new key');
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'));
  assert.deepEqual(exportGroups(manifest, designedFrames(manifest)), [
    { penFile: 'canonical.lib.pen', nodeIds: ['oaz9c', 'hLRZB'] },
  ]);
});

test('a restored export for the same content skips the Pen CLI; new content exports again', async () => {
  const root = fixtureRoot();
  const out = join(root, 'out');
  const env = penEnv('https://blob.example/x.pen');
  const calls = [];
  const outputs = {};
  const options = body => ({
    out,
    root,
    env,
    run: exportingRun(out, calls),
    fetchImpl: penSource(body),
    log: () => {},
    report: (name, value) => {
      outputs[name] = value;
    },
  });
  const first = await runGoldenPathPen(options('{"v":1}'));
  assert.equal(first.exportSource, 'pen-cli');
  assert.equal(outputs.export_cacheable, 'true');
  assert.equal(
    readFileSync(join(out, 'png', EXPORT_KEY_FILE), 'utf8').trim(),
    first.cacheKey
  );
  // A new job: only the restored png/ survives.
  rmSync(join(out, 'workspace'), { recursive: true });
  calls.length = 0;
  const second = await runGoldenPathPen(options('{"v":1}'));
  assert.equal(second.exportSource, 'cache');
  assert.equal(second.exported.length, 2);
  assert.equal(outputs.export_cacheable, 'false');
  assert.ok(!calls.some(c => c.includes('interactive')), 'Pen CLI not run');
  assert.ok(
    calls.some(c => c.includes('scripts/invariants/pen-still-diff.mjs'))
  );
  assert.equal(
    JSON.parse(readFileSync(join(out, 'export.json'), 'utf8')).source,
    'cache'
  );

  calls.length = 0;
  const third = await runGoldenPathPen(options('{"v":2}'));
  assert.equal(third.exportSource, 'pen-cli');
  assert.ok(
    calls.some(c => c.includes('interactive')),
    'new content exports'
  );
});

test('a partial export is never cached', async () => {
  const root = fixtureRoot();
  const out = join(root, 'out');
  const outputs = {};
  await runGoldenPathPen({
    out,
    root,
    env: penEnv('https://blob.example/x.pen'),
    run: (cmd, args) => {
      if (args.includes('interactive'))
        writeFileSync(join(out, 'png', 'oaz9c.png'), 'png');
      return Buffer.from('');
    },
    fetchImpl: penSource('{"v":1}'),
    log: () => {},
    report: (name, value) => {
      outputs[name] = value;
    },
  });
  assert.equal(outputs.export_cacheable, 'false');
  assert.ok(!existsSync(join(out, 'png', EXPORT_KEY_FILE)));
});

test('a transient browser-install failure is retried before the strict diff runs', async () => {
  const root = fixtureRoot();
  const out = join(root, 'out');
  const calls = [];
  const installAttempts = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args.includes('install')) {
      installAttempts.push(1);
      // Fail the first two installs like an apt mirror 503 would.
      if (installAttempts.length < 3) throw new Error('apt-get failed: 503');
    }
    if (args.includes('interactive'))
      for (const id of ['oaz9c', 'hLRZB'])
        writeFileSync(join(out, 'png', `${id}.png`), `png-${id}`);
    return Buffer.from('');
  };
  const result = await runGoldenPathPen({
    out,
    root,
    env: penEnv('https://blob.example/x.pen'),
    run,
    fetchImpl: penSource('{"v":1}'),
    log: () => {},
  });
  assert.equal(installAttempts.length, 3, 'the browser install is retried');
  assert.equal(result.exported.length, 2);
  const diff = calls.find(c =>
    c.includes('scripts/invariants/pen-still-diff.mjs')
  );
  assert.ok(diff?.includes('--strict'), 'the diff still runs after the retry');
});

test('a persistent browser-install failure still fails red', async () => {
  const root = fixtureRoot();
  const installAttempts = [];
  await assert.rejects(
    () =>
      runGoldenPathPen({
        out: join(root, 'out'),
        root,
        env: penEnv('https://blob.example/x.pen'),
        run: (cmd, args) => {
          if (args.includes('interactive'))
            for (const id of ['oaz9c', 'hLRZB'])
              writeFileSync(join(root, 'out', 'png', `${id}.png`), `png-${id}`);
          if (args.includes('install')) {
            installAttempts.push(1);
            throw new Error('apt-get failed: 503');
          }
          return Buffer.from('');
        },
        fetchImpl: penSource('{"v":1}'),
        log: () => {},
      }),
    /apt-get failed/u
  );
  assert.equal(installAttempts.length, 3, 'every attempt is used up first');
});
