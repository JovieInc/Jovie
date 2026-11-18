import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { panel, data, toggleMock } = vi.hoisted(() => ({
  panel: { isOpen: false, isPreview: false },
  data: {
    selectedProfile: { id: 'p1', displayName: 'Tim White' } as {
      id: string;
      displayName: string;
    } | null,
  },
  toggleMock: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({
    isOpen: panel.isOpen,
    isPreview: panel.isPreview,
    isPinned: panel.isOpen && !panel.isPreview,
    toggle: toggleMock,
  }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ selectedProfile: data.selectedProfile }),
}));

vi.mock('@jovie/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@jovie/ui')>()),
  TooltipShortcut: ({ children }: { readonly children: ReactNode }) => children,
}));

import { ArtistProfileRailToggle } from './ArtistProfileRailToggle';

/** The shell mounts the rail this control points at with aria-controls. */
function WithRail({ children }: { readonly children: ReactNode }) {
  return (
    <>
      {children}
      <aside id='shell-artist-profile-rail' aria-label='Artist profile' />
    </>
  );
}

describe('ArtistProfileRailToggle states', () => {
  beforeEach(() => {
    panel.isOpen = false;
    panel.isPreview = false;
    data.selectedProfile = { id: 'p1', displayName: 'Tim White' };
    toggleMock.mockReset();
  });

  it('offers to show a closed rail and toggles it on click', async () => {
    const user = userEvent.setup();
    const { container } = render(<ArtistProfileRailToggle />);

    const button = screen.getByRole('button', {
      name: 'Show Tim White profile',
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(toggleMock).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('offers to hide a pinned rail', async () => {
    panel.isOpen = true;
    const { container } = render(
      <WithRail>
        <ArtistProfileRailToggle />
      </WithRail>
    );

    const button = screen.getByRole('button', {
      name: 'Hide Tim White profile',
    });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectNoA11yViolations(container);
  });

  it('offers to pin a previewed rail', async () => {
    panel.isOpen = true;
    panel.isPreview = true;
    const { container } = render(
      <WithRail>
        <ArtistProfileRailToggle previewTrigger={false} />
      </WithRail>
    );

    const button = screen.getByRole('button', {
      name: 'Pin Tim White profile',
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await expectNoA11yViolations(container);
  });

  it('falls back to a generic name when the display name is blank', async () => {
    data.selectedProfile = { id: 'p1', displayName: '   ' };
    const { container } = render(<ArtistProfileRailToggle />);

    expect(
      screen.getByRole('button', { name: 'Show Artist profile profile' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders nothing before a profile is selected', async () => {
    data.selectedProfile = null;
    const { container } = render(<ArtistProfileRailToggle />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
