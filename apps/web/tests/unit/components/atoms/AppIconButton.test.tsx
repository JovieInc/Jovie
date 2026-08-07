import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppIconButton } from '@/components/atoms/AppIconButton';

vi.mock('@jovie/ui', () => ({
  IconButton: ({
    children,
    variant,
    size,
    ...props
  }: ComponentProps<'button'> & {
    readonly variant?: string;
    readonly size?: string;
  }) => (
    <button type='button' data-variant={variant} data-size={size} {...props}>
      {children}
    </button>
  ),
  TooltipShortcut: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

describe('AppIconButton', () => {
  it('renders an accessible icon button', () => {
    render(
      <AppIconButton ariaLabel='Open details'>
        <span aria-hidden='true'>+</span>
      </AppIconButton>
    );

    const button = screen.getByRole('button', { name: 'Open details' });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('maps onto the canonical IconButton control variant at the sm size', () => {
    render(
      <AppIconButton ariaLabel='Open details'>
        <span aria-hidden='true'>+</span>
      </AppIconButton>
    );

    const button = screen.getByRole('button', { name: 'Open details' });
    expect(button).toHaveAttribute('data-variant', 'control');
    expect(button).toHaveAttribute('data-size', 'sm');
  });
});
