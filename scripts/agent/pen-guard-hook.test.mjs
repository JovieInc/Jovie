import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildCommand, parseCensus } from './pen-census.mjs';
import { censusPathFor, evaluateHook, scriptOf } from './pen-guard-hook.mjs';
import * as guard from './pen-structural-guard.mjs';

const census = {
  generatedAt: Date.now(),
  components: { JwsdW: 'App Shell', g3IC1: 'Action button' },
  instances: { JwsdW: 76, g3IC1: 341 },
  owners: { slot1: 'JwsdW', hdr: 'JwsdW' },
};

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'penhook-'));
  const file = join(dir, 'design.pen');
  writeFileSync(file, 'saved-bytes');
  mkdirSync(join(dir, 'census'));
  writeFileSync(
    censusPathFor(file, join(dir, 'census')),
    JSON.stringify(census)
  );
  return { dir, file, censusDir: join(dir, 'census') };
}
const event = (file, input) => ({
  tool_name: 'mcp__pencil__execute',
  tool_input: { filePath: file, input },
});

test('deliberate red: moving a slot node inside App Shell (76 instances) is blocked', async () => {
  const f = fixture();
  const out = await evaluateHook(event(f.file, 'M("slot1","JwsdW",0)'), {
    dir: f.censusDir,
    guard,
  });
  assert.equal(out.code, 2);
  assert.match(
    out.block,
    /slot1 inside component JwsdW, which has 76 instance/
  );
});

test('property-only edits and edits outside components pass; insert of an instance ref is not a target', async () => {
  const f = fixture();
  assert.equal(
    (
      await evaluateHook(event(f.file, 'U("slot1",{x:1})'), {
        dir: f.censusDir,
        guard,
      })
    ).code,
    0
  );
  const snaps = join(f.dir, 'snaps');
  const out = await evaluateHook(
    event(f.file, 'I("pageFrame",{type:"ref",ref:"g3IC1"})'),
    {
      dir: f.censusDir,
      guard: {
        ...guard,
        decideWithCensus: a =>
          guard.decideWithCensus({ ...a, snapshotDir: snaps }),
      },
    }
  );
  assert.equal(out.code, 0);
  assert.match(out.note, /snapshot/);
  assert.ok(existsSync(snaps));
});

test('no census: warn, never block', async () => {
  const f = fixture();
  const out = await evaluateHook(
    event(join(f.dir, 'other.pen'), 'D("slot1")'),
    { dir: f.censusDir, guard }
  );
  assert.equal(out.code, 0);
  assert.match(out.warn, /no instance census/);
});

test('patches are checked by their replacement text', () => {
  assert.equal(
    scriptOf({ editId: 'x', edits: [{ find: 'a', replace: 'D("slot1")' }] }),
    'D("slot1")'
  );
});

test('targets: first arg of I/M/D/R/C, second of M/C, path ids split', () => {
  assert.deepEqual(
    guard.targetsOf('M("a/b","c",0); D("d"); I("p",{ref:"zzz"})').sort(),
    ['a', 'b', 'c', 'd', 'p']
  );
});

test('census parsing keeps owners only for components with instances', () => {
  const line = `noise\nCENSUS|${JSON.stringify({ components: { A: 'a', B: 'b' }, instances: { A: 3 }, owners: { A: 'A', x: 'A', y: 'B' } })}\n`;
  const parsed = parseCensus(line);
  assert.deepEqual(parsed.owners, { A: 'A', x: 'A' });
  assert.throws(() => parseCensus('nothing'), /no CENSUS line/);
  assert.match(buildCommand(), /^execute\(/);
});
