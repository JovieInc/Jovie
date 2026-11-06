import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  encodePng,
  fillRect,
  solidImage,
} from '../invariants/pen-still-diff-lib.mjs';
import { sidebarFindings } from './brand-checks.mjs';
import { exportRefs } from './export-refs.mjs';
import {
  acquireLease,
  decideRound,
  frameDigest,
  readLease,
  releaseLease,
  withWriterLease,
} from './loop-state.mjs';
import { exportFramesHeadless, runPen } from './pen-bridge.mjs';
import { renderGuard } from './render-guard.mjs';
import { prepareHtml } from './render-html.mjs';
import { renderTrusted, reviewFrame, shouldReview } from './run.mjs';

const scratch = t => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-recovery-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const image = () => {
  const img = solidImage(160, 96, [6, 6, 6, 255]);
  fillRect(img, 105, 65, 30, 6, [220, 220, 220, 255]);
  return img;
};
const textFacts = {
  id: 'F',
  name: 'PROPOSAL / test',
  w: 320,
  h: 192,
  nodes: [
    { id: 'text', t: 'text', tx: 'Hello', d: 1, x: 200, y: 120, w: 80, h: 40 },
  ],
};

test('half-scale render checks text at scaled coordinates', async () => {
  const img = image();
  assert.match(
    renderGuard([{ id: 'F', img, md5: 'a' }], { F: textFacts })[0].reason,
    /missing text/
  );
  assert.deepEqual(
    renderGuard([{ id: 'F', img, md5: 'a' }], { F: textFacts }, { scale: 0.5 }),
    []
  );
  const scales = [];
  const result = await renderTrusted('F', '/unused', textFacts, {
    exporter: (_ids, _dir, { scale }) => {
      scales.push(scale);
      return [
        { id: 'F', path: '/unused/F.png', buf: encodePng(img), md5: 'a' },
      ];
    },
    requireStable: false,
    wait: async () => {},
    htmlFallback: async () => {
      throw new Error('unexpected HTML fallback');
    },
  });
  assert.deepEqual(scales, [1, 1, 1, 0.5]);
  assert.deepEqual(result.guard, []);
});

test('reference manifest rejects inkless text instead of bypassing facts checks', t => {
  const dir = scratch(t);
  const manifest = exportRefs({ test: 'F' }, dir, {
    exporter: () => [
      { id: 'F', path: join(dir, 'F.png'), buf: encodePng(image()), md5: 'a' },
    ],
    factsReader: id => {
      assert.equal(id, 'F');
      return { ...textFacts, nodes: [{ ...textFacts.nodes[0], x: 0, y: 0 }] };
    },
    pen: () => [],
  });
  assert.equal(manifest.surfaces.test.trusted, false);
  assert.match(manifest.surfaces.test.guard.join(' '), /missing text/);
  assert.equal(
    JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).surfaces.test
      .trusted,
    false
  );
});

test('headless export rejects missing frames before reading a prior PNG or snapshot', t => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'F.png'), 'stale');
  for (const trees of [[{ id: 'F', missing: true }], []]) {
    assert.throws(
      () =>
        exportFramesHeadless(['F'], dir, {
          snapshot: '/does-not-exist.pen',
          treesReader: () => trees,
          run: () => {
            throw new Error('should not run');
          },
        }),
      /missing frames: F/
    );
  }
  assert.equal(readFileSync(join(dir, 'F.png'), 'utf8'), 'stale');
});

test('headless export uses fresh output, preserves assets and double export, and rejects absent mapping/output', t => {
  const dir = scratch(t);
  const ws = join(dir, 'workspace');
  const out = join(dir, 'out');
  mkdirSync(ws);
  mkdirSync(out);
  mkdirSync(join(ws, 'fonts'));
  const snapshot = join(ws, 'canonical.pen');
  writeFileSync(snapshot, 'source');
  writeFileSync(join(out, 'F.png'), 'stale');
  const opts = {
    snapshot,
    treesReader: () => [
      {
        id: 'F',
        type: 'frame',
        children: [{ id: 'child', type: 'text', content: 'current unsaved' }],
      },
    ],
    run: (snippets, { inFile }) => {
      assert.equal(readFileSync(inFile, 'utf8'), 'source');
      assert.ok(existsSync(join(dirname(inFile), 'fonts')));
      assert.equal(snippets.filter(s => s.startsWith('Export')).length, 2);
      assert.match(snippets[0], /current unsaved/);
      assert.doesNotMatch(snippets[0], /"id":"child"/);
      const rendered = join(dirname(inFile), 'rendered');
      mkdirSync(rendered);
      writeFileSync(join(rendered, 'new.png'), encodePng(image()));
      return [{ message: 'OK', ok: true, lines: ['MAP["F","new"]'] }];
    },
  };
  const [render] = exportFramesHeadless(['F'], out, opts);
  assert.deepEqual(render.buf, encodePng(image()));
  assert.equal(readFileSync(snapshot, 'utf8'), 'source');
  assert.throws(
    () => exportFramesHeadless(['F'], out, { ...opts, run: () => [] }),
    /missing export mapping/
  );
  assert.throws(
    () =>
      exportFramesHeadless(['F'], out, {
        ...opts,
        run: () => [{ message: 'OK', ok: true, lines: ['MAP["F","F"]'] }],
      }),
    /ENOENT/
  );
});

test('runPen writes and parses responses larger than 64 KiB through a file', () => {
  const large = 'x'.repeat(150_000);
  const [result] = runPen(['Print("large")'], {
    inFile: '/private/snapshot.pen',
    outFile: '/private/out.pen',
    spawn: (_bin, _args, opts) => {
      writeFileSync(
        opts.stdio[1],
        JSON.stringify({ message: `OK\n\n## Print output\n${large}\n` })
      );
      return { status: 0 };
    },
  });
  assert.equal(result.lines[0], large);
});

test('SVG gradients, masks and clip-paths retain fragment references', () => {
  const html = prepareHtml(
    '<head></head><svg><path fill="url(#gradient)" mask="url(\'#mask\')" clip-path="url(#clip)"/></svg>',
    { assetBase: '/workspace', localFonts: {} }
  );
  assert.match(html, /url\(#gradient\)/);
  assert.match(html, /url\('#mask'\)/);
  assert.match(html, /url\(#clip\)/);
  assert.doesNotMatch(html, /file:/);
});

test('reference CLI runs from paths containing spaces and unicode', t => {
  const dir = join(scratch(t), 'a space ü');
  mkdirSync(dir);
  // Copy only the module graph: an invalid CLI pair
  // must produce an error. The old pathname comparison silently exited zero.
  cpSync(dirname(fileURLToPath(import.meta.url)), join(dir, 'pen-review'), {
    recursive: true,
  });
  mkdirSync(join(dir, 'invariants'));
  cpSync(
    new URL('../invariants/pen-still-diff-lib.mjs', import.meta.url),
    join(dir, 'invariants/pen-still-diff-lib.mjs')
  );
  const result = spawnSync(
    process.execPath,
    [join(dir, 'pen-review/export-refs.mjs'), '--sheet', 'invalid'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /split/);
});

test('incomplete judge evidence permits deterministic fixes but never counts as quiet', () => {
  const incomplete = {
    complete: false,
    quietRounds: 1,
    round: 0,
    maxRounds: 3,
  };
  assert.equal(decideRound(incomplete).action, 'rejudge');
  assert.equal(decideRound(incomplete).quietRounds, 0);
  const checks = [
    { severity: 'block', check: 'grid', node: 'n', message: 'off grid' },
  ];
  assert.equal(decideRound({ ...incomplete, checks }).action, 'fix');
  assert.equal(decideRound({ ...incomplete, checks, round: 2 }).action, 'fail');
  assert.equal(decideRound({ ...incomplete, round: 2 }).action, 'fail');
});

test('unchanged frames with transient render failure retry; settled verdicts skip', () => {
  const tree = { id: 'F', width: 100 };
  const digest = frameDigest(tree);
  for (const verdict of ['render-untrusted', 'error'])
    assert.ok(shouldReview(tree, { digest, verdict }));
  for (const verdict of ['pass', 'fail', 'needs-fix'])
    assert.equal(shouldReview(tree, { digest, verdict }), false);
  assert.ok(shouldReview({ ...tree, width: 101 }, { digest, verdict: 'pass' }));
});

test('stale ready marker is cleared before an exception in review', async t => {
  const renamed = [];
  await assert.rejects(
    reviewFrame(
      'F',
      { receiptsDir: scratch(t), fixer: 'none', holder: 'test' },
      {
        getTrees: () => [
          { id: 'F', name: 'PROPOSAL / A · ready for Tim rabcdef01' },
        ],
        rename: (id, name) => renamed.push([id, name]),
        getFacts: () => {
          throw new Error('IPC unavailable');
        },
      }
    ),
    /IPC unavailable/
  );
  assert.deepEqual(renamed, [['F', 'PROPOSAL / A']]);
});

test('inherited sidebar findings stay visible as warnings, owned badges still block', () => {
  const nodes = [
    { id: 'shell', d: 1, t: 'frame', nm: 'Sidebar', refName: 'Sidebar' },
    {
      id: 'shell/b',
      p: 'shell',
      d: 2,
      t: 'frame',
      segRefName: 'Sidebar',
      w: 24,
      h: 20,
      r: { fill: '$ion', cornerRadius: '$radius-pill' },
    },
    {
      id: 'shell/t',
      p: 'shell/b',
      d: 3,
      t: 'text',
      segRefName: 'Sidebar',
      tx: '3',
    },
    {
      id: 'own',
      p: 'shell',
      d: 2,
      t: 'frame',
      w: 24,
      h: 20,
      r: { fill: '$ion', cornerRadius: '$radius-pill' },
    },
    { id: 'text', p: 'own', d: 3, t: 'text', tx: '3' },
  ];
  const findings = sidebarFindings({ nodes });
  assert.equal(findings.find(f => f.node === 'shell/b').severity, 'warn');
  assert.equal(findings.find(f => f.node === 'own').severity, 'block');
});

test('lease fails closed for partial content, foreign PID, lock contention and expired renewal', t => {
  const path = join(scratch(t), 'lease.json');
  writeFileSync(path, '');
  assert.equal(acquireLease(path, { holder: 'same' }).ok, false);
  assert.equal(releaseLease(path, 'same'), false);
  writeFileSync(
    path,
    JSON.stringify({
      holder: 'same',
      pid: process.pid + 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
  );
  assert.equal(acquireLease(path, { holder: 'same' }).ok, false);
  rmSync(path);
  assert.ok(acquireLease(path, { holder: 'a', now: () => 100, ttlMs: 100 }).ok);
  assert.equal(
    acquireLease(path, { holder: 'a', now: () => 201, renewOnly: true }).ok,
    false
  );
  mkdirSync(`${path}.lock`);
  assert.equal(acquireLease(path, { holder: 'b' }).ok, false);
  assert.equal(releaseLease(path, 'a'), false);
});

test('writer lease renews and releases on success, exceptions and lost ownership', async t => {
  const path = join(scratch(t), 'lease.json');
  let time = 100;
  const options = { holder: 'a', ttlMs: 100, now: () => time };
  assert.equal(
    await withWriterLease(path, options, renew => {
      time = 150;
      renew();
      assert.equal(Date.parse(readLease(path).expiresAt), 250);
      return 'done';
    }),
    'done'
  );
  assert.equal(readLease(path), null);
  await assert.rejects(
    withWriterLease(path, options, () => {
      throw new Error('frame failed');
    }),
    /frame failed/
  );
  assert.equal(readLease(path), null);
  await assert.rejects(
    withWriterLease(path, options, renew => {
      time = 300;
      assert.ok(acquireLease(path, { holder: 'b', now: () => time }).ok);
      renew();
    }),
    /writer lease lost/
  );
  assert.equal(readLease(path).holder, 'b');
});

test('competing processes cannot share a holder or race an expired takeover', async t => {
  const path = join(scratch(t), 'lease.json');
  writeFileSync(
    path,
    JSON.stringify({ holder: 'old', expiresAt: '2000-01-01T00:00:00Z' })
  );
  const module = new URL('./loop-state.mjs', import.meta.url).href;
  const results = await Promise.all(
    Array.from(
      { length: 8 },
      () =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [
            '--input-type=module',
            '-e',
            `import {acquireLease} from ${JSON.stringify(module)}; console.log(JSON.stringify(acquireLease(${JSON.stringify(path)}, {holder:'same'})));`,
          ]);
          let stdout = '';
          child.stdout.on('data', b => {
            stdout += b;
          });
          child.on('error', reject);
          child.on('exit', code =>
            code === 0
              ? resolve(JSON.parse(stdout))
              : reject(new Error(`exit ${code}`))
          );
        })
    )
  );
  assert.equal(results.filter(r => r.ok).length, 1);
});

test('review workflow repairs deterministic defects during incomplete panel and requires two complete quiet rounds', async t => {
  const dir = scratch(t);
  const png = encodePng(image());
  const path = join(dir, 'render.png');
  writeFileSync(path, png);
  let fixes = 0;
  let panels = 0;
  const renamed = [];
  const events = [];
  const tree = { id: 'F', name: 'PROPOSAL / A' };
  const receipt = await reviewFrame(
    'F',
    { receiptsDir: dir, holder: 'test', maxRounds: 4 },
    {
      getTrees: () => [tree],
      getFacts: () => ({
        name: tree.name,
        w: 800,
        nodes: fixes
          ? []
          : [
              {
                id: 'bad',
                t: 'frame',
                d: 1,
                x: 1.5,
                y: 0,
                w: 20,
                h: 20,
                r: {},
              },
            ],
      }),
      renderFrame: async () => ({
        path,
        buf: png,
        md5: 'a',
        guard: [],
        attempt: 0,
        renderer: 'pen-headless',
        stable: true,
      }),
      panelFor: async () => ({
        complete: panels++ >= 2,
        gates: { status: 'ok', pass: true, failed: [] },
        judges: [],
      }),
      fix: prompt => {
        assert.match(prompt, /grid/);
        fixes++;
        return { status: 0, out: 'fixed', err: '' };
      },
      rename: (id, name) => renamed.push([id, name]),
      record: event => events.push(event),
    }
  );
  assert.equal(fixes, 1);
  assert.deepEqual(
    receipt.rounds.map(r => r.decision.action),
    ['fix', 'rejudge', 'rejudge', 'pass']
  );
  assert.equal(receipt.verdict, 'pass');
  assert.match(renamed[0][1], /ready for Tim r[0-9a-f]{8}/);
  assert.ok(existsSync(join(dir, 'F', 'before.png')));
  assert.ok(existsSync(join(dir, 'F', 'after.png')));
  assert.equal(events.filter(e => e.stage === 'pen-review-round').length, 4);
});
