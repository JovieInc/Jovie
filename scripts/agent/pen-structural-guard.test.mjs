import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { classifyOps, decide, snapshotFile } from './pen-structural-guard.mjs';

const MOVE = 'M("slot1","JwsdW",0)\nU("hdr",{fill:"#000"})';

test('classification: property edits pass, tree-shape edits are structural', () => {
  assert.equal(classifyOps('U("a",{x:1})\nG("a",{})').propertyOnly, true);
  assert.equal(classifyOps(MOVE).propertyOnly, false);
  for (const op of [
    'I("p",{type:"frame"})',
    'D("a")',
    'R("a",{})',
    'C("a","p")',
  ])
    assert.equal(classifyOps(op).propertyOnly, false, op);
  assert.equal(
    classifyOps('// M("x") in a comment\nU("a",{label:"M(1)"})').propertyOnly,
    true
  );
});

test('deliberate red: moving slot nodes in a master with instances is refused, no snapshot written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-'));
  const file = join(dir, 'design.pen');
  writeFileSync(file, 'binary');
  const out = decide({
    script: MOVE,
    instances: 76,
    file,
    snapshotDir: join(dir, 'snaps'),
  });
  assert.equal(out.allowed, false);
  assert.match(out.reason, /76 instance/);
  assert.equal(existsSync(join(dir, 'snaps')), false);
});

test('property-only edits on a component with instances are allowed', () => {
  assert.equal(decide({ script: 'U("a",{x:1})', instances: 76 }).allowed, true);
});

test('structural edit on a component with no instances is allowed, after a snapshot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-'));
  const file = join(dir, 'design.pen');
  writeFileSync(file, 'original-bytes');
  const out = decide({
    script: MOVE,
    instances: 0,
    file,
    snapshotDir: join(dir, 'snaps'),
    now: new Date('2026-10-26T04:00:00Z'),
  });
  assert.equal(out.allowed, true);
  assert.ok(out.snapshot && existsSync(out.snapshot));
  assert.equal(readFileSync(out.snapshot, 'utf8'), 'original-bytes');
});

test('snapshotFile refuses a missing file', () => {
  assert.throws(
    () =>
      snapshotFile('/nonexistent/x.pen', mkdtempSync(join(tmpdir(), 'pen-'))),
    /missing file/
  );
});
