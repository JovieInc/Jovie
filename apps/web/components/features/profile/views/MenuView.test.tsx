import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuView } from './MenuView';

const baseProps = {
  onNavigate: vi.fn(),
  hasReleases: false,
  hasTourDates: false,
  hasTip: false,
  hasContacts: false,
};

describe('MenuView release credits entry', () => {
  it('lists release credits when the latest release has credits', () => {
    const onOpenReleaseCredits = vi.fn();
    render(
      <MenuView {...baseProps} onOpenReleaseCredits={onOpenReleaseCredits} />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Release credits' }));

    expect(onOpenReleaseCredits).toHaveBeenCalledTimes(1);
    expect(baseProps.onNavigate).not.toHaveBeenCalled();
  });

  it('omits the entry when there are no credits', () => {
    render(<MenuView {...baseProps} />);

    expect(
      screen.queryByRole('menuitem', { name: 'Release credits' })
    ).toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Share Profile' })
    ).toBeInTheDocument();
  });
});
