import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/atoms/SwipeToReveal', () => ({
  SwipeToReveal: ({
    actions,
    children,
  }: {
    actions: ReactNode;
    children: ReactNode;
  }) => (
    <div data-testid='swipe-wrapper'>
      <div data-testid='swipe-actions'>{actions}</div>
      {children}
    </div>
  ),
}));

const { SidebarLinkRow } = await import(
  '@/components/molecules/drawer/SidebarLinkRow'
);

describe('SidebarLinkRow styling regression', () => {
  it('uses a solid background so swipe actions do not bleed through', () => {
    render(
      <SidebarLinkRow
        icon={<span>icon</span>}
        label='Spotify'
        url='https://open.spotify.com/artist/123'
        testId='link-row'
      />
    );

    const row = screen.getByTestId('link-row');

    // Must have a solid background (bg-surface-2), NOT bg-transparent
    expect(row.className).toContain('bg-surface-2');
    expect(row.className).not.toContain('bg-transparent');
  });

  it('hides desktop hover actions on mobile via hidden lg:flex', () => {
    render(
      <SidebarLinkRow
        icon={<span>icon</span>}
        label='Instagram'
        url='https://instagram.com/test'
        testId='link-row'
      />
    );

    // The desktop actions container (parent of the Open/Copy buttons in the row)
    // should be hidden on mobile. Find it by looking for the Open button's parent.
    const row = screen.getByTestId('link-row');

    // The desktop actions wrapper is the second direct child div (after the icon+label div)
    const actionsWrapper = row.children[1] as HTMLElement;
    expect(actionsWrapper.className).toContain('hidden');
    expect(actionsWrapper.className).toContain('lg:flex');
  });

  it('still renders swipe actions for mobile usage', () => {
    render(
      <SidebarLinkRow
        icon={<span>icon</span>}
        label='YouTube'
        url='https://youtube.com/test'
      />
    );

    // Swipe actions should exist (via the mocked SwipeToReveal)
    const swipeActions = screen.getByTestId('swipe-actions');
    expect(swipeActions).toBeInTheDocument();

    // Swipe actions should contain copy and open buttons
    const swipeCopyBtn = screen.getAllByRole('button', {
      name: 'Copy YouTube link',
    });
    const swipeOpenBtn = screen.getAllByRole('button', {
      name: 'Open YouTube',
    });
    expect(swipeCopyBtn.length).toBeGreaterThanOrEqual(1);
    expect(swipeOpenBtn.length).toBeGreaterThanOrEqual(1);
  });
});
