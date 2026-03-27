import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppIconButton } from '@/components/atoms/AppIconButton';

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  TooltipShortcut: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

describe('AppIconButton', () => {
  it('renders icon buttons as full pills by default', () => {
    render(
      <AppIconButton ariaLabel='Open details'>
        <span aria-hidden='true'>+</span>
      </AppIconButton>
    );

    const button = screen.getByRole('button', { name: 'Open details' });
    expect(button.className).toContain('rounded-full');
    expect(button.className).toContain('border-(--linear-app-frame-seam)');
    expect(button.className).toContain('shadow-[');
  });
});
