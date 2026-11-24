import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { affordanceViolations, check } from './empty-affordance.mjs';

const FILE = 'apps/web/components/Menu.tsx';
const caretMenu = guard =>
  [
    "import { ChevronDown } from 'lucide-react';",
    guard,
    'export const Menu = ({ links }) => (',
    '  <button aria-expanded={open}>Menu<ChevronDown /></button>',
    ');',
    'const rows = links.map(l => l.label);',
  ].join('\n');

describe('empty affordance', () => {
  it('flags a caret trigger over a mapped collection with no emptiness guard', () => {
    assert.deepEqual(affordanceViolations(caretMenu(''), FILE), [
      `caret-unguarded:${FILE}`,
    ]);
  });

  it('accepts a length guard, an entry derivation, or a declared contract', () => {
    for (const guard of [
      'if (links.length === 0) return null;',
      'const entries = toHeaderNavEntries(menus);',
      '// affordance-guarded: links is non-empty by schema',
    ]) {
      assert.deepEqual(affordanceViolations(caretMenu(guard), FILE), []);
    }
  });

  it('flags a count badge that only checks for undefined', () => {
    const source = '{item.badge !== undefined && <Badge count={item.badge} />}';
    assert.deepEqual(affordanceViolations(source, FILE), [
      `badge-zero:${FILE}`,
    ]);
    assert.deepEqual(
      affordanceViolations(
        '{item.badge !== undefined && item.badge > 0 && <Badge />}',
        FILE
      ),
      []
    );
  });

  it('holds the repo to its shrink-only baseline', () => {
    assert.deepEqual(check().failures, []);
  });
});
