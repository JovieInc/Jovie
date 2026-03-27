import { render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  PageToolbarActionButton,
  PageToolbarTabButton,
} from '@/components/organisms/table/molecules/PageToolbar';

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

describe('PageToolbar buttons', () => {
  it('renders action buttons as elevated pills', () => {
    render(<PageToolbarActionButton label='Display' icon={<Search />} />);

    const button = screen.getByRole('button', { name: 'Display' });
    expect(button.className).toContain('rounded-full');
    expect(button.className).toContain('border-(--linear-app-frame-seam)');
    expect(button.className).toContain('shadow-[');
  });

  it('renders active tab buttons with pill styling', () => {
    render(<PageToolbarTabButton label='Releases' active />);

    const button = screen.getByRole('button', { name: 'Releases' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.className).toContain('rounded-full');
    expect(button.className).toContain('shadow-[');
  });

  it('keeps icon-only actions accessible', () => {
    render(
      <PageToolbarActionButton
        label='Preview'
        icon={<Search />}
        iconOnly
        ariaLabel='Toggle preview'
        tooltipLabel='Toggle preview'
      />
    );

    const button = screen.getByRole('button', { name: 'Toggle preview' });
    expect(button.className).toContain('w-7');
    expect(screen.getByText('Preview')).toHaveClass('sr-only');
  });
});
