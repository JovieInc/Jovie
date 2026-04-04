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
  it('renders action buttons accessibly', () => {
    render(<PageToolbarActionButton label='Display' icon={<Search />} />);

    const button = screen.getByRole('button', { name: 'Display' });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('marks active tab buttons as pressed', () => {
    render(<PageToolbarTabButton label='Releases' active />);

    const button = screen.getByRole('button', { name: 'Releases' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
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
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });
});
