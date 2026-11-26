import { expect } from 'vitest';

export function expectDesktop28Control(
  control: HTMLElement,
  { square = false }: { readonly square?: boolean } = {}
) {
  expect(control).toHaveClass(
    'h-7',
    'min-h-7',
    'lg:before:h-7',
    'lg:before:min-w-0'
  );
  expect(control).not.toHaveClass('h-8');
  expect(control).not.toHaveClass('h-7.5');
  if (square) {
    expect(control).toHaveClass('w-7', 'min-w-7');
    expect(control).not.toHaveClass('w-8');
  }
}
