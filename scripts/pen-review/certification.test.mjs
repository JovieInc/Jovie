import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { reviewFrame } from './run.mjs';

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pen-certification-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('disabled save refuses persistence with a failing exit status', t => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'disabled'), '');
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./run.mjs', import.meta.url)), 'save'],
    { env: { ...process.env, PEN_REVIEW_STATE: dir }, encoding: 'utf8' }
  );
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /disabled/);
});

for (const change of ['after final panel', 'between quiet rounds']) {
  test(`review does not certify changes ${change}`, async t => {
    const dir = scratch(t);
    const path = join(dir, 'render.png');
    writeFileSync(path, 'render fixture');
    let reads = 0;
    let panels = 0;
    const renamed = [];
    const receipt = await reviewFrame(
      'F',
      {
        receiptsDir: dir,
        holder: 'test',
        maxRounds: 2,
      },
      {
        getTrees: () => [
          {
            id: 'F',
            name: 'PROPOSAL / A',
            content:
              ++reads >= (change === 'after final panel' ? 4 : 3)
                ? 'changed'
                : 'original',
          },
        ],
        getFacts: () => ({ name: 'PROPOSAL / A', w: 800, nodes: [] }),
        renderFrame: async () => ({
          path,
          buf: Buffer.from('fixture'),
          md5: 'a',
          guard: [],
          attempt: 0,
          renderer: 'test',
          stable: true,
        }),
        panelFor: async () => {
          panels++;
          return {
            complete: true,
            judges: [],
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
          };
        },
        rename: (id, name) => renamed.push([id, name]),
        record: () => {},
      }
    );
    assert.equal(panels, 2);
    assert.equal(receipt.verdict, 'fail');
    assert.equal(receipt.readyMarked, undefined);
    assert.deepEqual(renamed, []);
    if (change === 'after final panel')
      assert.match(receipt.failure, /changed/);
  });
}
