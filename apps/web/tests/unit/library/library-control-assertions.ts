import { expect } from 'vitest';

export function expectDesktop32Control(
  control: HTMLElement,
  { square = false }: { readonly square?: boolean } = {}
) {
  expect(control).toHaveClass(
    'h-8',
    'min-h-8',
    'lg:before:h-8',
    'lg:before:min-w-0'
  );
  expect(control).not.toHaveClass('h-7');
  expect(control).not.toHaveClass('h-7.5');
  if (square) {
    expect(control).toHaveClass('w-8', 'min-w-8');
    expect(control).not.toHaveClass('w-7');
  }
}
