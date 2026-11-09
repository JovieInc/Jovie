import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RightDrawer } from '@/components/molecules/drawer/RightDrawer';

// Same doubles as RightDrawer.interaction.test.tsx; split out to keep that
// suite under the company size guard.
const mockUseBreakpointDown = vi.fn();

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: (...args: unknown[]) => mockUseBreakpointDown(...args),
}));

vi.mock('@jovie/ui', () => ({
  CommonDropdown: ({
    children,
    items,
  }: {
    children: React.ReactNode;
    items: unknown[];
  }) => (
    <div data-testid='context-dropdown' data-items-count={items.length}>
      {children}
    </div>
  ),
}));

describe('RightDrawer presentation', () => {
  beforeEach(() => {
    mockUseBreakpointDown.mockReset();
    mockUseBreakpointDown.mockReturnValue(false);
  });

  it('pushes by default and lets only a transient preview request the overlay', () => {
    const { rerender } = render(
      <RightDrawer isOpen width={360} ariaLabel='Push details'>
        <div>Body</div>
      </RightDrawer>
    );
    const drawer = screen.getByRole('complementary', { name: 'Push details' });
    expect(drawer).toHaveAttribute('data-rail-presentation', 'push');
    // Capped against the main plane like the slot, minus the shell gap.
    expect(drawer.style.maxWidth).toBe('calc(50cqw - var(--app-shell-gap))');
    rerender(
      <RightDrawer
        isOpen
        width={360}
        ariaLabel='Push details'
        presentation='overlay'
      >
        <div>Body</div>
      </RightDrawer>
    );
    expect(drawer).toHaveAttribute('data-rail-presentation', 'overlay');
  });
});
