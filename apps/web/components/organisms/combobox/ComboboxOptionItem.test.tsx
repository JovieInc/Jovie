import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const optionSource = readFileSync(
  new URL('./ComboboxOptionItem.tsx', import.meta.url),
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
