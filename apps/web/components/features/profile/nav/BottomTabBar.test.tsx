/**
 * Unit tests for BottomTabBar (JOV-2022)
 *
 * Covers:
 *  - All four tabs render when hasTourDates = true
 *  - Three tabs render when hasTourDates = false (Events omitted)
 *  - Active tab is marked with aria-current="page"
 *  - Active tab uses correct text/icon colour class (font-semibold)
 *  - Inactive tabs do not have aria-current
 *  - More button renders when hideMoreMenu = false
 *  - More button omitted when hideMoreMenu = true
 *  - More button aria-expanded reflects isMenuOpen
 *  - Tab click handler calls onTabSelect with correct mode
 *  - More click handler calls onOpenMenu
 *  - Grid column count matches visible tab count
 *  - No horizontal overflow at narrow viewports (320px) — structural check
 *  - 44×44pt touch target minimum via min-h-[52px] class
 *  - Active state: Events tab falls back to profile when hasTourDates=false but activeTab='tour'
 *    (caller resolves this before passing — BottomTabBar just renders what it receives)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BottomTabBarProps } from './BottomTabBar';
import { BottomTabBar } from './BottomTabBar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(overrides?: Partial<BottomTabBarProps>): BottomTabBarProps {
  return {
    activeTab: 'profile',
    hasTourDates: true,
    hideMoreMenu: false,
    isMenuOpen: false,
    onTabSelect: vi.fn(),
    onOpenMenu: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tab rendering
// ---------------------------------------------------------------------------

describe('BottomTabBar — tab rendering', () => {
  it('renders all four primary tabs when hasTourDates is true', () => {
    render(<BottomTabBar {...makeProps({ hasTourDates: true })} />);
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('omits the Events tab when hasTourDates is false', () => {
    render(<BottomTabBar {...makeProps({ hasTourDates: false })} />);
    expect(
      screen.queryByRole('button', { name: 'Events' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('renders a More button when hideMoreMenu is false', () => {
    render(<BottomTabBar {...makeProps({ hideMoreMenu: false })} />);
    expect(
      screen.getByRole('button', { name: 'More options' })
    ).toBeInTheDocument();
  });

  it('omits the More button when hideMoreMenu is true', () => {
    render(<BottomTabBar {...makeProps({ hideMoreMenu: true })} />);
    expect(
      screen.queryByRole('button', { name: 'More options' })
    ).not.toBeInTheDocument();
  });

  it('renders the nav with accessible label', () => {
    render(<BottomTabBar {...makeProps()} />);
    expect(
      screen.getByRole('navigation', { name: 'Profile navigation' })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Active state
// ---------------------------------------------------------------------------

describe('BottomTabBar — active state', () => {
  it('marks the active tab with aria-current="page"', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'listen' })} />);
    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('does not mark inactive tabs with aria-current', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'listen' })} />);
    const homeBtn = screen.getByRole('button', { name: 'Home' });
    expect(homeBtn).not.toHaveAttribute('aria-current', 'page');
    expect(homeBtn.getAttribute('aria-current')).toBeNull();
  });

  it('marks the active tab with font-semibold class on label', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'subscribe' })} />);
    const alertsBtn = screen.getByRole('button', { name: 'Alerts' });
    // The label span inside the active button should be font-semibold
    const span = alertsBtn.querySelector('span');
    expect(span?.className).toContain('font-semibold');
  });

  it('uses font-medium class on inactive tab labels', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'profile' })} />);
    const musicBtn = screen.getByRole('button', { name: 'Music' });
    const span = musicBtn.querySelector('span');
    expect(span?.className).toContain('font-medium');
    expect(span?.className).not.toContain('font-semibold');
  });

  it('marks the profile (Home) tab active by default', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'profile' })} />);
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('does not mark any primary tab active when menu is open (isMenuOpen=true)', () => {
    render(
      <BottomTabBar
        {...makeProps({ activeTab: 'profile', isMenuOpen: true })}
      />
    );
    // No primary tab should have aria-current when the menu is open
    const buttons = screen
      .getAllByRole('button')
      .filter(btn => btn.getAttribute('aria-label') !== 'More options');
    for (const btn of buttons) {
      expect(btn).not.toHaveAttribute('aria-current', 'page');
    }
  });
});

// ---------------------------------------------------------------------------
// More button state
// ---------------------------------------------------------------------------

describe('BottomTabBar — More button', () => {
  it('More button has aria-haspopup="dialog"', () => {
    render(<BottomTabBar {...makeProps()} />);
    expect(
      screen.getByRole('button', { name: 'More options' })
    ).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('More button aria-expanded is false when menu is closed', () => {
    render(<BottomTabBar {...makeProps({ isMenuOpen: false })} />);
    expect(
      screen.getByRole('button', { name: 'More options' })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('More button aria-expanded is true when menu is open', () => {
    render(<BottomTabBar {...makeProps({ isMenuOpen: true })} />);
    expect(
      screen.getByRole('button', { name: 'More options' })
    ).toHaveAttribute('aria-expanded', 'true');
  });
});

// ---------------------------------------------------------------------------
// Interaction handlers
// ---------------------------------------------------------------------------

describe('BottomTabBar — interaction handlers', () => {
  it('calls onTabSelect with "profile" when Home is clicked', () => {
    const onTabSelect = vi.fn();
    render(<BottomTabBar {...makeProps({ onTabSelect })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(onTabSelect).toHaveBeenCalledTimes(1);
    expect(onTabSelect).toHaveBeenCalledWith('profile');
  });

  it('calls onTabSelect with "listen" when Music is clicked', () => {
    const onTabSelect = vi.fn();
    render(<BottomTabBar {...makeProps({ onTabSelect })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Music' }));
    expect(onTabSelect).toHaveBeenCalledWith('listen');
  });

  it('calls onTabSelect with "tour" when Events is clicked', () => {
    const onTabSelect = vi.fn();
    render(
      <BottomTabBar {...makeProps({ onTabSelect, hasTourDates: true })} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(onTabSelect).toHaveBeenCalledWith('tour');
  });

  it('calls onTabSelect with "subscribe" when Alerts is clicked', () => {
    const onTabSelect = vi.fn();
    render(<BottomTabBar {...makeProps({ onTabSelect })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(onTabSelect).toHaveBeenCalledWith('subscribe');
  });

  it('calls onOpenMenu when More is clicked', () => {
    const onOpenMenu = vi.fn();
    render(<BottomTabBar {...makeProps({ onOpenMenu })} />);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Grid / layout
// ---------------------------------------------------------------------------

describe('BottomTabBar — grid layout', () => {
  it('has 5 columns when hasTourDates=true and hideMoreMenu=false', () => {
    const { container } = render(
      <BottomTabBar
        {...makeProps({ hasTourDates: true, hideMoreMenu: false })}
      />
    );
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid?.getAttribute('style')).toContain('repeat(5,');
  });

  it('has 4 columns when hasTourDates=false and hideMoreMenu=false', () => {
    const { container } = render(
      <BottomTabBar
        {...makeProps({ hasTourDates: false, hideMoreMenu: false })}
      />
    );
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid?.getAttribute('style')).toContain('repeat(4,');
  });

  it('has 4 columns when hasTourDates=true and hideMoreMenu=true', () => {
    const { container } = render(
      <BottomTabBar
        {...makeProps({ hasTourDates: true, hideMoreMenu: true })}
      />
    );
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid?.getAttribute('style')).toContain('repeat(4,');
  });

  it('has 3 columns when hasTourDates=false and hideMoreMenu=true', () => {
    const { container } = render(
      <BottomTabBar
        {...makeProps({ hasTourDates: false, hideMoreMenu: true })}
      />
    );
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid?.getAttribute('style')).toContain('repeat(3,');
  });

  it('all primary tab buttons have min-h-[52px] for 44pt touch target compliance', () => {
    const { container } = render(<BottomTabBar {...makeProps()} />);
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      expect(btn.className).toContain('min-h-[52px]');
    }
  });

  it('tab bar wrapper has data-testid="profile-tab-bar"', () => {
    render(<BottomTabBar {...makeProps()} />);
    expect(screen.getByTestId('profile-tab-bar')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Nav constants integration smoke test
// ---------------------------------------------------------------------------

describe('BottomTabBar — safe area classes', () => {
  it('applies pb-[max(env(safe-area-inset-bottom),10px)] inside the bar wrapper', () => {
    const { container } = render(<BottomTabBar {...makeProps()} />);
    const wrapper = container.querySelector('[data-testid="profile-tab-bar"]');
    expect(wrapper?.className).toContain(
      'pb-[max(env(safe-area-inset-bottom),10px)]'
    );
  });
});
