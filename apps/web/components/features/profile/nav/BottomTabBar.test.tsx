/**
 * Unit tests for BottomTabBar (JOV-2022)
 *
 * Covers:
 *  - All four destinations render whether or not shows exist
 *  - Active destination is marked with aria-current="page"
 *  - Tab click handler calls onTabSelect with correct mode
 *  - Grid column count matches the shared destination contract
 *  - Get updates is not an equal-weight destination
 *  - Fan-capture flags do not hide Home · Music · Shows · About
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TAB_BAR_INTERNAL_SAFE_AREA_PADDING } from '@/lib/profile/nav-constants';
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tab rendering
// ---------------------------------------------------------------------------

describe('BottomTabBar — tab rendering', () => {
  it('renders the shared Home · Music · Shows · About destinations', () => {
    render(<BottomTabBar {...makeProps({ hasTourDates: true })} />);
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shows' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Events' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alerts' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Get updates' })).toBeNull();
  });

  it('keeps Shows when hasTourDates is false', () => {
    render(<BottomTabBar {...makeProps({ hasTourDates: false })} />);
    expect(screen.getByRole('button', { name: 'Shows' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
  });

  it('does not let fan-capture flags invent or hide destinations', () => {
    const { container } = render(
      <BottomTabBar
        {...makeProps({ showAlerts: false, showAlertsTab: false })}
      />
    );

    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shows' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alerts' })).toBeNull();
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid?.getAttribute('style')).toContain('repeat(4,');
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
      screen.getByRole('navigation', { name: 'Profile Navigation' })
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
    render(<BottomTabBar {...makeProps({ activeTab: 'about' })} />);
    const aboutBtn = screen.getByRole('button', { name: 'About' });
    const span = aboutBtn.querySelector('span');
    expect(span?.className).toContain('font-semibold');
  });

  it('does not promote Get updates into a destination when subscribe is requested', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'subscribe' })} />);
    expect(screen.queryByRole('button', { name: 'Alerts' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Get updates' })).toBeNull();
    for (const name of ['Home', 'Music', 'Shows', 'About']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute(
        'aria-current',
        'page'
      );
    }
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

  it('calls onTabSelect with "tour" when Shows is clicked', () => {
    const onTabSelect = vi.fn();
    render(
      <BottomTabBar {...makeProps({ onTabSelect, hasTourDates: true })} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Shows' }));
    expect(onTabSelect).toHaveBeenCalledWith('tour');
  });

  it('calls onTabSelect with "about" when About is clicked', () => {
    const onTabSelect = vi.fn();
    render(<BottomTabBar {...makeProps({ onTabSelect })} />);
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(onTabSelect).toHaveBeenCalledWith('about');
  });

  it('keeps tab selection keyboard-operable inside the safe-area wrapper', async () => {
    const user = userEvent.setup();
    const onTabSelect = vi.fn();
    const { container } = render(
      <BottomTabBar {...makeProps({ onTabSelect })} />
    );
    const wrapper = container.querySelector('[data-testid="profile-tab-bar"]');
    const music = screen.getByRole('button', { name: 'Music' });

    expect(wrapper?.className).toContain(TAB_BAR_INTERNAL_SAFE_AREA_PADDING);

    music.focus();
    await user.keyboard('{Enter}');

    expect(onTabSelect).toHaveBeenCalledWith('listen');
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

  it('keeps the dock icon-only while each named grid cell remains interactive', () => {
    const { container } = render(<BottomTabBar {...makeProps()} />);
    const nav = screen.getByTestId('profile-bottom-nav');
    expect(nav.className).toContain('h-8');
    expect(nav.className).toContain('px-1');
    expect(nav.className).not.toContain('p-1');
    expect(nav.className).toContain('rounded-full');

    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid?.className).toContain('h-11');
    expect(grid?.className).toContain('-my-1.5');

    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      expect(btn.className).toContain('h-full');
      expect(btn.className).not.toContain('min-h-13');
      const label = btn.querySelector('span');
      const icon = btn.querySelector('svg');
      expect(icon?.getAttribute('class')).toContain('h-4 w-4');
      expect(label?.className).toContain('sr-only');
      expect(btn).toHaveAttribute('aria-label', label?.textContent);
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
  it('applies the canonical internal safe-area padding inside the bar wrapper', () => {
    const { container } = render(<BottomTabBar {...makeProps()} />);
    const wrapper = container.querySelector('[data-testid="profile-tab-bar"]');
    expect(wrapper?.className).toContain(TAB_BAR_INTERNAL_SAFE_AREA_PADDING);
  });
});
