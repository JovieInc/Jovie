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
 *  - One shared liquid-glass lens follows the active tab (spring or snap)
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TAB_BAR_INTERNAL_SAFE_AREA_PADDING } from '@/lib/profile/nav-constants';
import type { BottomTabBarProps } from './BottomTabBar';
import { BottomTabBar } from './BottomTabBar';

// The global setup stubs motion/react; the lens tests need the real springs.
vi.mock('motion/react', async importOriginal => importOriginal());

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
  it('renders the shared Home · Music · Events · About destinations', () => {
    render(<BottomTabBar {...makeProps({ hasTourDates: true })} />);
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shows' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alerts' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Get updates' })).toBeNull();
  });

  it('keeps Shows when hasTourDates is false', () => {
    render(<BottomTabBar {...makeProps({ hasTourDates: false })} />);
    expect(screen.getByRole('button', { name: 'Events' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Events' })).toBeInTheDocument();
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
    for (const name of ['Home', 'Music', 'Events', 'About']) {
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
    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
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

// ---------------------------------------------------------------------------
// Liquid glass lens indicator
// ---------------------------------------------------------------------------

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

describe('BottomTabBar — liquid glass lens', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders exactly one shared indicator sized to one column', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'listen' })} />);
    const lenses = screen.getAllByTestId('profile-bottom-nav-indicator');
    expect(lenses).toHaveLength(1);
    const [lens] = lenses;
    expect(lens).toHaveAttribute('aria-hidden', 'true');
    expect(lens).toHaveAttribute('data-active-index', '1');
    expect(lens).toHaveAttribute('data-visible', 'true');
    expect(lens.style.width).toBe('25%');
    // The indicator is decoration: it never adds a focusable or named node.
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('starts on the active column without animating in from the first tab', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'about' })} />);
    const lens = screen.getByTestId('profile-bottom-nav-indicator');
    expect(lens).toHaveAttribute('data-active-index', '3');
    expect(lens.style.transform).toContain('translateX(300%)');
  });

  it('moves the same indicator when the active tab changes', async () => {
    stubReducedMotion(false);
    const { rerender } = render(
      <BottomTabBar {...makeProps({ activeTab: 'profile' })} />
    );
    const lens = screen.getByTestId('profile-bottom-nav-indicator');
    expect(lens).toHaveAttribute('data-active-index', '0');

    rerender(<BottomTabBar {...makeProps({ activeTab: 'tour' })} />);

    const moved = screen.getByTestId('profile-bottom-nav-indicator');
    expect(moved).toBe(lens);
    // Springing, not snapping: the lens has not landed synchronously.
    expect(moved.style.transform).not.toContain('translateX(200%)');
    expect(moved).toHaveAttribute('data-active-index', '2');
    // Label-agnostic: the third destination (tour) is the active cell.
    expect(screen.getAllByRole('button')[2]).toHaveAttribute(
      'aria-current',
      'page'
    );
    // The spring settles on the new column (with a hint of overshoot, it
    // never stays short of the target).
    await waitFor(
      () => {
        expect(moved.style.transform).toContain('translateX(200%)');
      },
      { timeout: 3000 }
    );
  });

  it('snaps the indicator with no stretch when motion is reduced', async () => {
    stubReducedMotion(true);
    const { rerender } = render(
      <BottomTabBar {...makeProps({ activeTab: 'profile' })} />
    );
    rerender(<BottomTabBar {...makeProps({ activeTab: 'about' })} />);

    const lens = screen.getByTestId('profile-bottom-nav-indicator');
    // A snap lands within a frame; a spring would still be mid-flight.
    await waitFor(
      () => {
        expect(lens.style.transform).toContain('translateX(300%)');
      },
      { timeout: 100, interval: 16 }
    );
    expect(lens.style.transform).not.toMatch(/scale[XY]\((?!1\))/);
  });

  it('hides the lens while the menu is open and keeps one indicator mounted', () => {
    render(
      <BottomTabBar {...makeProps({ activeTab: 'listen', isMenuOpen: true })} />
    );
    const lenses = screen.getAllByTestId('profile-bottom-nav-indicator');
    expect(lenses).toHaveLength(1);
    expect(lenses[0]).toHaveAttribute('data-visible', 'false');
    expect(lenses[0]).not.toHaveAttribute('data-active-index');
  });

  it('hides the lens when no primary destination is active', () => {
    render(<BottomTabBar {...makeProps({ activeTab: 'subscribe' })} />);
    expect(screen.getByTestId('profile-bottom-nav-indicator')).toHaveAttribute(
      'data-visible',
      'false'
    );
  });

  it('keeps tap feedback on the glyph so the hit area never scales', () => {
    stubReducedMotion(false);
    render(<BottomTabBar {...makeProps()} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.className).not.toContain('scale');
      const glyph = btn.querySelector('.profile-liquid-glass-nav__glyph');
      expect(glyph).not.toBeNull();
      expect(glyph?.querySelector('svg')).not.toBeNull();
    }
  });
});
