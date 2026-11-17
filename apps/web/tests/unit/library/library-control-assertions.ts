import { expect } from 'vitest';

export function expectToolbarControl(
  control: HTMLElement,
  { square = false }: { readonly square?: boolean } = {}
) {
  // PageToolbar owns the compact 28px scale; other controls retain their
  // existing 32px assertion below.
  expect(control).toHaveClass('h-7', 'min-h-7');
  expect(control).not.toHaveClass('h-8');
  if (square) {
    expect(control).toHaveClass('w-7', 'min-w-7');
    expect(control).not.toHaveClass('w-8');
  }
}

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
