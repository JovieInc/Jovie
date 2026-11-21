// biome-ignore-all format: keep ActionButton projection tests under combined-tree budget.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { MANIFEST, ROOT } from './native-design-system.mjs';
import {
  ACTION_BUTTON_END,
  ACTION_BUTTON_START,
  contractNumber,
  projectedActionButton,
  replaceActionButtonProjection,
} from './native-design-system-action-button.mjs';

const manifest = JSON.parse(readFileSync(resolve(ROOT, MANIFEST), 'utf8'));
const contract = readFileSync(resolve(ROOT, manifest.actionButtonContract), 'utf8');
const dup =
  'export const ACTION_BUTTON_VISIBLE_HEIGHT_PX = 28;\nexport const ACTION_BUTTON_VISIBLE_HEIGHT_PX = 32;\n';

test('contractNumber reads KEEP 28/44', () => {
  assert.equal(contractNumber(contract, 'ACTION_BUTTON_VISIBLE_HEIGHT_PX'), 28);
  assert.equal(contractNumber(contract, 'ACTION_BUTTON_MOBILE_HIT_TARGET_PX'), 44);
  assert.throws(() => contractNumber(contract, 'MISSING_EXPORT'), /Missing/);
  assert.throws(() => contractNumber(contract, 'bad-name'), /Invalid/);
  assert.throws(() => contractNumber(dup, 'ACTION_BUTTON_VISIBLE_HEIGHT_PX'), /Duplicate/);
});

test('projection binds height/hitTarget to KEEP', () => {
  const out = projectedActionButton(manifest.actionButtonBindings, contract);
  for (const s of [
    ACTION_BUTTON_START,
    ACTION_BUTTON_END,
    'static let height: CGFloat = 28',
    'static let hitTarget: CGFloat = 44',
  ])
    assert.ok(out.includes(s));
  assert.throws(() => projectedActionButton([], contract), /required/);
  assert.throws(() => projectedActionButton([['height', 'bad-name']], contract), /Invalid/);
  assert.throws(
    () =>
      projectedActionButton(
        [
          ['height', 'ACTION_BUTTON_VISIBLE_HEIGHT_PX'],
          ['height', 'ACTION_BUTTON_VISIBLE_HEIGHT_PX'],
        ],
        contract
      ),
    /Bad/
  );
  assert.throws(() => projectedActionButton([['height']], contract), /Ambiguous/);
});

test('boundary replace catches stale height 32', () => {
  const projection = projectedActionButton(manifest.actionButtonBindings, contract);
  const source = `enum JovieActionButtonMetrics {\n${ACTION_BUTTON_START}\n  static let height: CGFloat = 32\n${ACTION_BUTTON_END}\n}`;
  const green = replaceActionButtonProjection(source, projection);
  assert.match(green, /height: CGFloat = 28/);
  assert.match(green, /hitTarget: CGFloat = 44/);
  assert.equal(replaceActionButtonProjection(green, projection), green);
  assert.throws(
    () => replaceActionButtonProjection(source + ACTION_BUTTON_START, projection),
    /boundary/
  );
  assert.throws(() => replaceActionButtonProjection('no boundary', projection), /boundary/);
});
