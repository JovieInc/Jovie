import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const optionSource = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'ComboboxOptionItem.tsx'
  ),
  'utf8'
);

const legacyOptionStateClasses = [
  ['bg', 'accent'].join('-'),
  ['text', 'accent', 'foreground'].join('-'),
  ['text', 'indigo', '600'].join('-'),
  '<svg',
];

describe('ComboboxOptionItem', () => {
  it('keeps option states on shared menu tokens', () => {
    expect(optionSource).toContain('MENU_ITEM_BASE');
    expect(optionSource).toContain('MENU_ITEM_SELECTED');
    expect(optionSource).toContain('lucide-react');
    expect(optionSource).toContain(
      "data-testid='combobox-option-selected-indicator'"
    );

    for (const className of legacyOptionStateClasses) {
      expect(optionSource).not.toContain(className);
    }
  });
});
