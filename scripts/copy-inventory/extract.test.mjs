import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildInventory, IDS_PATH } from './extract.mjs';

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

test('a new line gets the next number and never renumbers old ones', () => {
  const { rows } = buildInventory(registry);
  const drop = rows.find(r => r.id.startsWith('SL-'));
  const trimmed = {
    ids: Object.fromEntries(
      Object.entries(registry.ids).filter(([, v]) => v !== drop.id)
    ),
  };
  const again = buildInventory(trimmed).rows;
  const max = Math.max(
    ...Object.values(registry.ids)
      .filter(v => v.startsWith('SL-'))
      .map(v => Number(v.split('-')[1]))
  );
  // Other not-yet-registered lines (a main that moved) may take the next
  // numbers first, so assert "after every existing number", not "exactly next".
  const reborn = again.find(
    r => r.text === drop.text && r.source === drop.source
  ).id;
  assert.match(reborn, /^SL-\d+$/);
  assert.ok(Number(reborn.split('-')[1]) > max);
  for (const r of rows.filter(x => x.id !== drop.id)) {
    assert.equal(
      again.find(x => x.source === r.source && x.text === r.text)?.id,
      r.id
    );
  }
});

test('home record slots are keyed on the record field', () => {
  const home = buildInventory(registry).rows.filter(r =>
    r.source.startsWith('record:marketing-page/home#')
  );
  assert.ok(home.some(r => r.source.endsWith('hero.subhead')));
});

test('committed ID registry covers every extracted row', () => {
  const known = new Set(Object.values(registry.ids));
  const missing = buildInventory(registry).rows.filter(r => !known.has(r.id));
  assert.deepEqual(
    missing.map(r => r.id),
    []
  );
});
