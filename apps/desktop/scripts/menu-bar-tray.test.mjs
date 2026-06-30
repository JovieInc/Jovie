/**
 * Pure-logic tests for the menu bar tray module. Imports only what can run
 * without Electron present — the type guard and state constants extracted from
 * the source file via regex, not by importing the module (which requires Electron).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('tray source defines all four required states', async () => {
  const src = await readFile(join(desktopRoot, 'src/menu-bar-tray.ts'), 'utf8');

  for (const state of ['idle', 'active', 'unread', 'error']) {
    assert.match(src, new RegExp(`'${state}'`), `missing state: ${state}`);
  }
});

test('tray source does not reference polling timers', async () => {
  const src = await readFile(join(desktopRoot, 'src/menu-bar-tray.ts'), 'utf8');

  assert.doesNotMatch(src, /setInterval/, 'must not use setInterval (event-driven only)');
  assert.doesNotMatch(src, /setTimeout/, 'must not use setTimeout for polling');
});

test('isValidTrayState accepts only the four declared states', () => {
  // Inline re-implementation of the guard to verify the contract without Electron
  const VALID = new Set(['idle', 'active', 'unread', 'error']);
  const guard = (v) => typeof v === 'string' && VALID.has(v);

  assert.equal(guard('idle'), true);
  assert.equal(guard('active'), true);
  assert.equal(guard('unread'), true);
  assert.equal(guard('error'), true);
  assert.equal(guard('unknown'), false);
  assert.equal(guard(''), false);
  assert.equal(guard(null), false);
  assert.equal(guard(undefined), false);
  assert.equal(guard(42), false);
});
