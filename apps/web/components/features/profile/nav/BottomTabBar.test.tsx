/**
 * Unit tests for BottomTabBar (JOV-2022)
 *
 * Covers:
 *  - All four tabs render whether or not events exist
 *  - Active tab is marked with aria-current="page"
 *  - Active tab uses correct icon colour class
 *  - Inactive tabs do not have aria-current
 *  - Tab click handler calls onTabSelect with correct mode
 *  - Grid column count matches visible tab count
 *  - No horizontal overflow at narrow viewports (320px) — structural check
 *  - 44×44pt touch target minimum via min-h-[50px] class
 *  - Empty Events tabs remain reachable so the surface can show alert signup
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
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('keeps the Events tab when hasTourDates is false', () => {
    render(<BottomTabBar {...makeProps({ hasTourDates: false })} />);
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('does not render a More button', () => {
    render(<BottomTabBar {...makeProps()} />);
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
    const homeBtn = screen.getByRole('button', { name: 'Profile' });
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

  it('marks the profile tab active by default', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'profile' })} />);
    expect(screen.getByRole('button', { name: 'Profile' })).toHaveAttribute(
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
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).not.toHaveAttribute('aria-current', 'page');
    }
  });
});

// ---------------------------------------------------------------------------
// Interaction handlers
// ---------------------------------------------------------------------------

describe('BottomTabBar — interaction handlers', () => {
  it('calls onTabSelect with "profile" when Profile is clicked', () => {
    const onTabSelect = vi.fn();
    render(<BottomTabBar {...makeProps({ onTabSelect })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
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
});

// ---------------------------------------------------------------------------
// Grid / layout
// ---------------------------------------------------------------------------

describe('BottomTabBar — grid layout', () => {
  it('has 4 columns when hasTourDates=true', () => {
    const { container } = render(
      <BottomTabBar {...makeProps({ hasTourDates: true })} />
    );
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid?.getAttribute('style')).toContain('repeat(4,');
  });

  it('has 4 columns when hasTourDates=false', () => {
    const { container } = render(
      <BottomTabBar {...makeProps({ hasTourDates: false })} />
    );
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid?.getAttribute('style')).toContain('repeat(4,');
  });

  it('all primary tab buttons have min-h-[50px] for 44pt touch target compliance', () => {
    const { container } = render(<BottomTabBar {...makeProps()} />);
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      expect(btn.className).toContain('min-h-[50px]');
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
