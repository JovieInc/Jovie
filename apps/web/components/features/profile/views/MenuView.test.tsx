import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuView } from './MenuView';

const baseProps = {
  onNavigate: vi.fn(),
  hasReleases: true,
  hasTourDates: false,
  hasTip: true,
  hasContacts: true,
};

describe('MenuView', () => {
  it('lists share, pay and contact entries', () => {
    render(<MenuView {...baseProps} />);
    expect(
      screen.getAllByRole('menuitem').map(item => item.textContent)
    ).toEqual(['Share Profile', 'Pay', 'Contact']);
  });

  it('adds Release credits only when credits can open (jov.ie/tim dogfood)', () => {
    const onOpenReleaseCredits = vi.fn();
    const { rerender } = render(<MenuView {...baseProps} />);
    expect(
      screen.queryByRole('menuitem', { name: 'Release credits' })
    ).toBeNull();

    rerender(
      <MenuView {...baseProps} onOpenReleaseCredits={onOpenReleaseCredits} />
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Release credits' }));
    expect(onOpenReleaseCredits).toHaveBeenCalledTimes(1);
  });
});
