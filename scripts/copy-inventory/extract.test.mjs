import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildInventory, IDS_PATH } from './extract.mjs';
import { createAssigner, DERIVED_MIN, derivedNumber } from './ids.mjs';

const registry = JSON.parse(readFileSync(IDS_PATH, 'utf8'));

test('IDs are short, speakable and unique', () => {
  const { rows } = buildInventory(registry);
  const seen = new Set();
  for (const r of rows) {
    assert.match(r.id, /^[A-Z]+-\d+$/);
    assert.ok(!seen.has(r.id), `duplicate id ${r.id}`);
    seen.add(r.id);
    assert.ok(r.text.length > 1 && r.source && r.route && r.role);
  }
});

test('IDs are stable across runs and registry-seeded runs', () => {
  const a = buildInventory({ ids: {} });
  const b = buildInventory(a.registry);
  assert.deepEqual(
    a.rows.map(r => [r.id, r.text]),
    b.rows.map(r => [r.id, r.text])
  );
});

test('a line with no pinned ID gets its hash ID; pinned ones never move', () => {
  const { rows } = buildInventory(registry);
  const drop = rows.find(r => r.id.startsWith('SL-'));
  const trimmed = {
    ids: Object.fromEntries(
      Object.entries(registry.ids).filter(([, v]) => v !== drop.id)
    ),
  };
  const again = buildInventory(trimmed).rows;
  const key = Object.keys(registry.ids).find(k => registry.ids[k] === drop.id);
  const reborn = again.find(
    r => r.text === drop.text && r.source === drop.source
  ).id;
  assert.equal(reborn, `SL-${derivedNumber(key)}`);
  for (const r of rows.filter(x => x.id !== drop.id)) {
    assert.equal(
      again.find(x => x.source === r.source && x.text === r.text)?.id,
      r.id
    );
  }
});

test('parallel new lines cannot claim the same ID or edit the registry', () => {
  // Two PRs each add a line under one prefix: each ID depends only on its own
  // key, so either order of landing gives both the same IDs.
  const a = createAssigner(registry.ids);
  const b = createAssigner(registry.ids);
  const x = 'apps/web/app/(home)/page.tsx#New line from PR one';
  const y = 'apps/web/app/(home)/page.tsx#New line from PR two';
  const ax = a.assign('HOME', x);
  const ay = a.assign('HOME', y);
  assert.equal(b.assign('HOME', y), ay);
  assert.equal(b.assign('HOME', x), ax);
  assert.notEqual(ax, ay);
  assert.ok(derivedNumber(x) >= DERIVED_MIN && derivedNumber(x) <= 99999);
  const pinned = new Set(Object.values(registry.ids));
  assert.ok(!pinned.has(ax) && !pinned.has(ay));
  assert.deepEqual(JSON.parse(readFileSync(IDS_PATH, 'utf8')), registry);
});

test('a hash clash steps to the next free number', () => {
  const seen = new Map();
  let pair;
  for (let i = 0; !pair; i += 1) {
    const k = `clash-${i}`;
    const n = derivedNumber(k);
    if (seen.has(n)) pair = [seen.get(n), k, n];
    else seen.set(n, k);
  }
  const [first, second, n] = pair;
  const { assign } = createAssigner({});
  assert.equal(assign('HOME', first), `HOME-${n}`);
  assert.equal(
    assign('HOME', second),
    `HOME-${n + 1 > 99999 ? DERIVED_MIN : n + 1}`
  );
  const pinnedFirst = createAssigner({ [first]: `HOME-${n}` });
  assert.notEqual(pinnedFirst.assign('HOME', second), `HOME-${n}`);
});

test('home record slots are keyed on the record field', () => {
  const home = buildInventory(registry).rows.filter(r =>
    r.source.startsWith('record:marketing-page/home#')
  );
  assert.ok(home.some(r => r.source.endsWith('hero.subhead')));
});

test('every row ID is pinned in ids.gen.json or derived from its key', () => {
  const known = new Set(Object.values(registry.ids));
  const stray = buildInventory(registry).rows.filter(
    r => !known.has(r.id) && Number(r.id.split('-')[1]) < DERIVED_MIN
  );
  assert.deepEqual(
    stray.map(r => r.id),
    []
  );
});
