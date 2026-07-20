import { act, fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtistProfileModeSwitcher } from '@/components/marketing/artist-profile/ArtistProfileModeSwitcher';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

const reducedMotionMock = vi.hoisted(() => ({ value: false }));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reducedMotionMock.value,
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate: _animate,
      children,
      initial: _initial,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      animate?: unknown;
      initial?: unknown;
      transition?: unknown;
      children?: ReactNode;
    }) => <div {...props}>{children}</div>,
    p: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLParagraphElement> & {
      animate?: unknown;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
      children?: ReactNode;
    }) => <p {...props}>{children}</p>,
  },
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    fill: _fill,
    priority: _priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  }) => <img alt={alt} {...props} />,
}));

function renderSwitcher() {
  return render(
    <ArtistProfileModeSwitcher
      adaptive={ARTIST_PROFILE_COPY.adaptive}
      phoneCaption={ARTIST_PROFILE_COPY.hero.phoneCaption}
      phoneSubcaption={ARTIST_PROFILE_COPY.hero.phoneSubcaption}
    />
  );
}

function expectSelectedMode(name: string) {
  expect(screen.getByRole('tab', { name })).toHaveAttribute(
    'aria-selected',
    'true'
  );
}

describe('ArtistProfileModeSwitcher', () => {
  afterEach(() => {
    reducedMotionMock.value = false;
    vi.useRealTimers();
  });

  it('keeps the accessible two-stage release-to-tour cadence in the scheduled mode IDs', () => {
    vi.useFakeTimers();
    const { container } = renderSwitcher();

    expect(
      screen.getByRole('tablist', { name: 'Profile Modes' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);

    const activeSlot = container.querySelector(
      '.artist-profile-mode-switcher-active'
    );
    expect(activeSlot).toHaveClass('min-h-[2.4rem]');

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expectSelectedMode('Upcoming Release');

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expectSelectedMode('Touring');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expectSelectedMode('Touring');
    expect(
      container.querySelector('.artist-profile-mode-switcher-active')
    ).toBe(activeSlot);
  });

  it('keeps a manual accessible selection after cancelling the scheduled cadence', () => {
    vi.useFakeTimers();
    renderSwitcher();

    act(() => {
      vi.advanceTimersByTime(220);
    });
    const upcomingReleaseTab = screen.getByRole('tab', {
      name: 'Upcoming Release',
    });
    upcomingReleaseTab.focus();
    fireEvent.keyDown(upcomingReleaseTab, { key: 'ArrowRight' });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expectSelectedMode('Release Day');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expectSelectedMode('Release Day');
  });

  it('does not auto-select a mode for reduced motion while retaining tab controls', () => {
    reducedMotionMock.value = true;
    vi.useFakeTimers();
    renderSwitcher();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('aria-selected', 'false');
    }

    const upcomingReleaseTab = screen.getByRole('tab', {
      name: 'Upcoming Release',
    });
    upcomingReleaseTab.focus();
    fireEvent.keyDown(upcomingReleaseTab, { key: 'ArrowRight' });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expectSelectedMode('Release Day');
  });
});
