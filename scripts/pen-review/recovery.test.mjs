import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  encodePng,
  fillRect,
  solidImage,
} from '../invariants/pen-still-diff-lib.mjs';
import { frameDigest } from './loop-state.mjs';
import { renderGuard } from './render-guard.mjs';
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
        gates: {
          status: 'evaluated',
          pass: true,
          failed: [],
          schema: 'test',
          model: 'test',
          profile: 'app',
          surface: 'test',
          advisory: false,
          certified: false,
        },
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

for (const verdict of ['render-untrusted', 'needs-fix']) {
  test(`early ${verdict} exit retains round timing`, async t => {
    const dir = scratch(t);
    const path = join(dir, 'render.png');
    writeFileSync(path, encodePng(image()));
    const events = [];
    const receipt = await reviewFrame(
      'F',
      { receiptsDir: dir, fixer: 'none' },
      {
        getTrees: () => [{ id: 'F', name: 'PROPOSAL / timing' }],
        getFacts: () => ({
          name: 'PROPOSAL / timing',
          w: 800,
          nodes: [
            { id: 'bad', t: 'frame', d: 1, x: 1.5, y: 0, w: 20, h: 20, r: {} },
          ],
        }),
        renderFrame: async () => ({
          path,
          md5: 'a',
          guard: verdict === 'render-untrusted' ? ['garbled'] : [],
          attempt: 0,
        }),
        panelFor: async () => ({
          complete: true,
          gates: { status: 'evaluated', pass: true, rules: {} },
          judges: [],
        }),
        rename: () => {},
        record: event => events.push(event),
      }
    );
    assert.equal(receipt.verdict, verdict);
    const rounds = events.filter(event => event.stage === 'pen-review-round');
    assert.equal(rounds.length, 1);
    assert.equal(rounds[0].startedAt, receipt.rounds[0].startedAt);
    assert.equal(rounds[0].finishedAt, receipt.rounds[0].finishedAt);
  });
}
