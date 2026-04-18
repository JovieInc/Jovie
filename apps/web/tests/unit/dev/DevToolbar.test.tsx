import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetTheme = vi.fn();

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: mockSetTheme }),
}));

const FF_OVERRIDES_KEY = '__ff_overrides';

function setLocalOverrides(overrides: Record<string, boolean>) {
  localStorage.setItem(FF_OVERRIDES_KEY, JSON.stringify(overrides));
}

vi.mock('@/lib/feature-flags/shared', () => ({
  FF_OVERRIDES_KEY: '__ff_overrides',
  CODE_FLAG_KEYS: {
    CLAIM_HANDLE: 'code:CLAIM_HANDLE',
    HERO_SPOTIFY: 'code:HERO_SPOTIFY',
    BILLING_UPGRADE: 'code:BILLING_UPGRADE',
    THREADS_ENABLED: 'code:THREADS_ENABLED',
  },
  FEATURE_FLAGS: {
    CLAIM_HANDLE: false,
    HERO_SPOTIFY: false,
    BILLING_UPGRADE: false,
    THREADS_ENABLED: false,
  },
}));

import { DevToolbar } from '@/components/features/dev/DevToolbar';

const TOOLBAR_HIDDEN_KEY = '__dev_toolbar_hidden';
const TOOLBAR_OPEN_KEY = '__dev_toolbar_open';

function renderToolbar(
  props?: Partial<{ env: string; sha: string; version: string }>
) {
  return render(
    <DevToolbar
      env={props?.env ?? 'development'}
      sha={props?.sha ?? 'abc1234'}
      version={props?.version ?? '1.0.0'}
    />
  );
}

describe('DevToolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.setProperty('--dev-toolbar-height', '0px');
    mockSetTheme.mockClear();

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.setProperty('--dev-toolbar-height', '0px');
  });

  // ─── Show/Hide ───────────────────────────────────────────────

  describe('show/hide', () => {
    it('shows the full toolbar when no localStorage key is set (first visit)', () => {
      renderToolbar();
      expect(screen.getByText('development')).toBeInTheDocument();
    });

    it('shows the "Dev" pill when localStorage says hidden', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
      renderToolbar();
      expect(
        screen.getByRole('button', { name: 'Show dev toolbar' })
      ).toBeInTheDocument();
    });

    it('shows the full toolbar when the Dev pill is clicked', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'Show dev toolbar' }));
      expect(screen.getByText('development')).toBeInTheDocument();
    });

    it('persists hidden=false to localStorage when shown', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'Show dev toolbar' }));
      expect(localStorage.getItem(TOOLBAR_HIDDEN_KEY)).toBe('0');
    });

    it('hides the toolbar when the X button is clicked', () => {
      renderToolbar();
      expect(screen.getByText('development')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Hide dev toolbar' }));
      expect(
        screen.getByRole('button', { name: 'Show dev toolbar' })
      ).toBeInTheDocument();
    });

    it('persists hidden=true to localStorage when hidden via X', () => {
      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'Hide dev toolbar' }));
      expect(localStorage.getItem(TOOLBAR_HIDDEN_KEY)).toBe('1');
    });

    it('restores visible state from localStorage on mount', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '0');
      renderToolbar();
      expect(screen.getByText('development')).toBeInTheDocument();
    });

    it('restores hidden state from localStorage on mount', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
      renderToolbar();
      expect(
        screen.getByRole('button', { name: 'Show dev toolbar' })
      ).toBeInTheDocument();
    });

    it('resets --dev-toolbar-height CSS variable when toolbar is hidden', () => {
      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'Hide dev toolbar' }));
      expect(
        document.documentElement.style.getPropertyValue('--dev-toolbar-height')
      ).toBe('0px');
    });
  });

  // ─── Keyboard Shortcut ──────────────────────────────────────

  describe('keyboard shortcut (Cmd+Shift+D)', () => {
    it('shows toolbar when hidden via Cmd+Shift+D', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
      renderToolbar();
      expect(
        screen.getByRole('button', { name: 'Show dev toolbar' })
      ).toBeInTheDocument();

      fireEvent.keyDown(document, {
        key: 'd',
        shiftKey: true,
        metaKey: true,
      });

      expect(screen.getByText('development')).toBeInTheDocument();
    });

    it('hides toolbar when visible via Cmd+Shift+D', () => {
      renderToolbar();
      expect(screen.getByText('development')).toBeInTheDocument();

      fireEvent.keyDown(document, {
        key: 'd',
        shiftKey: true,
        metaKey: true,
      });

      expect(
        screen.getByRole('button', { name: 'Show dev toolbar' })
      ).toBeInTheDocument();
    });

    it('works with Ctrl+Shift+D (non-Mac)', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
      renderToolbar();

      fireEvent.keyDown(document, {
        key: 'd',
        shiftKey: true,
        ctrlKey: true,
      });

      expect(screen.getByText('development')).toBeInTheDocument();
    });

    it('does not trigger on other key combinations', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
      renderToolbar();

      // Just Shift+D (no meta/ctrl)
      fireEvent.keyDown(document, { key: 'd', shiftKey: true });
      expect(
        screen.getByRole('button', { name: 'Show dev toolbar' })
      ).toBeInTheDocument();

      // Cmd+D (no shift)
      fireEvent.keyDown(document, { key: 'd', metaKey: true });
      expect(
        screen.getByRole('button', { name: 'Show dev toolbar' })
      ).toBeInTheDocument();
    });

    it('persists state to localStorage', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
      renderToolbar();

      fireEvent.keyDown(document, {
        key: 'd',
        shiftKey: true,
        metaKey: true,
      });

      expect(localStorage.getItem(TOOLBAR_HIDDEN_KEY)).toBe('0');
    });

    it('shows shortcut hint on pill button title', () => {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
      renderToolbar();
      const pill = screen.getByRole('button', { name: 'Show dev toolbar' });
      expect(pill).toHaveAttribute('title', 'Show dev toolbar (⌘⇧D)');
    });

    it('closes expanded panel on Escape without hiding toolbar', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      // Panel should be expanded
      expect(
        screen.getByRole('button', { name: 'Collapse dev toolbar' })
      ).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      // Panel collapsed, but toolbar still visible
      expect(
        screen.getByRole('button', { name: 'Expand dev toolbar' })
      ).toBeInTheDocument();
      expect(screen.getByText('development')).toBeInTheDocument();
      expect(localStorage.getItem(TOOLBAR_OPEN_KEY)).toBe('0');
    });

    it('does not close panel on Escape when already collapsed', () => {
      renderToolbar();

      fireEvent.keyDown(document, { key: 'Escape' });

      // Toolbar still visible, not hidden
      expect(screen.getByText('development')).toBeInTheDocument();
    });
  });

  // ─── Search ─────────────────────────────────────────────────

  describe('search', () => {
    it('renders search input when expanded', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();
      expect(
        screen.getByPlaceholderText('Search flags...')
      ).toBeInTheDocument();
    });

    it('filters flags by search query', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      const searchInput = screen.getByPlaceholderText('Search flags...');
      fireEvent.change(searchInput, { target: { value: 'claim' } });

      expect(screen.getByText('claim handle')).toBeInTheDocument();
      expect(screen.queryByText('hero spotify')).not.toBeInTheDocument();
    });

    it('is case-insensitive', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      const searchInput = screen.getByPlaceholderText('Search flags...');
      fireEvent.change(searchInput, { target: { value: 'CLAIM' } });

      expect(screen.getByText('claim handle')).toBeInTheDocument();
    });

    it('shows empty state when no flags match', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      const searchInput = screen.getByPlaceholderText('Search flags...');
      fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

      expect(screen.getByText(/No flags match/)).toBeInTheDocument();
    });

    it('shows match count', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      // Should show "4 of 4" initially (all 4 code flags)
      expect(screen.getByText('4 of 4')).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText('Search flags...');
      fireEvent.change(searchInput, { target: { value: 'claim' } });

      expect(screen.getByText('1 of 4')).toBeInTheDocument();
    });

    it('clears search when clear button is clicked', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      const searchInput = screen.getByPlaceholderText('Search flags...');
      fireEvent.change(searchInput, { target: { value: 'claim' } });

      expect(screen.getByText('1 of 4')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

      expect(screen.getByText('4 of 4')).toBeInTheDocument();
    });

    it('does not show clear button when search is empty', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();
      expect(
        screen.queryByRole('button', { name: 'Clear search' })
      ).not.toBeInTheDocument();
    });
  });

  // ─── Unified Flag List ──────────────────────────────────────

  describe('unified flag list', () => {
    it('shows all code flags in one list', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      expect(screen.getByText('claim handle')).toBeInTheDocument();
      expect(screen.getByText('threads enabled')).toBeInTheDocument();
    });

    it('shows source label for each non-overridden flag', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      const sourceLabels = screen.getAllByText(/^code$/);
      expect(sourceLabels.length).toBe(4); // all code flags
    });
  });

  // ─── Override Sorting ───────────────────────────────────────

  describe('override sorting', () => {
    it('shows overrides group when flags are overridden', () => {
      setLocalOverrides({ 'code:CLAIM_HANDLE': true });
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      expect(screen.getByText('Overrides (1)')).toBeInTheDocument();
    });

    it('does not show overrides group when no flags are overridden', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      expect(screen.queryByText(/Overrides/)).not.toBeInTheDocument();
    });

    it('shows server default for overridden flags', () => {
      setLocalOverrides({ 'code:CLAIM_HANDLE': true });
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      expect(screen.getByText('server: off')).toBeInTheDocument();
    });

    it('shows clear all button in overrides group', () => {
      setLocalOverrides({ 'code:CLAIM_HANDLE': true });
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      expect(screen.getByText('clear all')).toBeInTheDocument();
    });

    it('clears all overrides when clear all is clicked', () => {
      setLocalOverrides({ 'code:CLAIM_HANDLE': true });
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      fireEvent.click(screen.getByText('clear all'));
      expect(localStorage.getItem(FF_OVERRIDES_KEY)).toBeNull();
    });

    it('shows correct override count for multiple overrides', () => {
      setLocalOverrides({
        'code:CLAIM_HANDLE': true,
        'code:THREADS_ENABLED': true,
      });
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      expect(screen.getByText('Overrides (2)')).toBeInTheDocument();
    });
  });

  // ─── Copy Actions ───────────────────────────────────────────

  describe('copy actions', () => {
    it('copies SHA to clipboard when SHA button is clicked', async () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      // Expand to see the actions row
      fireEvent.click(screen.getByRole('button', { name: 'Copy SHA' }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc1234');
    });

    it('copies route to clipboard when route button is clicked', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      fireEvent.click(screen.getByRole('button', { name: 'Copy route' }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/');
    });

    it('does not crash when clipboard fails', () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Not allowed')),
        },
      });

      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      // Should not throw
      expect(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy SHA' }));
      }).not.toThrow();
    });
  });

  // ─── Toggle Flash Feedback ─────────────────────────────────

  describe('toggle flash feedback', () => {
    it('applies flash class when an already-overridden flag is toggled', () => {
      setLocalOverrides({ 'code:CLAIM_HANDLE': true });
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      // Find the switch in the overrides section (already overridden flag)
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      // The parent row should have the flash background class
      const row = switches[0].closest('[class*="rounded-sm"]');
      expect(row?.className).toContain('bg-[var(--color-accent)]/10');
    });
  });

  // ─── Override Badge (collapsed) ─────────────────────────────

  describe('override badge', () => {
    it('shows override count in collapsed bar when overrides exist', () => {
      setLocalOverrides({ 'code:CLAIM_HANDLE': true });
      renderToolbar();

      expect(screen.getByText('1 override')).toBeInTheDocument();
    });

    it('uses plural for multiple overrides', () => {
      setLocalOverrides({
        'code:CLAIM_HANDLE': true,
        'code:THREADS_ENABLED': true,
      });
      renderToolbar();

      expect(screen.getByText('2 overrides')).toBeInTheDocument();
    });

    it('does not show badge when no overrides', () => {
      renderToolbar();

      expect(screen.queryByText(/override/)).not.toBeInTheDocument();
    });

    it('opens panel when badge is clicked and panel is collapsed', () => {
      setLocalOverrides({ 'code:CLAIM_HANDLE': true });
      renderToolbar();

      // Panel should be collapsed
      expect(
        screen.getByRole('button', { name: 'Expand dev toolbar' })
      ).toBeInTheDocument();

      fireEvent.click(screen.getByText('1 override'));

      // Panel should now be expanded
      expect(
        screen.getByRole('button', { name: 'Collapse dev toolbar' })
      ).toBeInTheDocument();
    });
  });

  // ─── Theme Picker ───────────────────────────────────────────

  describe('theme picker', () => {
    it('renders icon-only theme buttons', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      expect(
        screen.getByRole('button', { name: 'Dark theme' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Light theme' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'System theme' })
      ).toBeInTheDocument();
    });

    it('calls setTheme when theme button is clicked', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));
      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });
  });

  // ─── Env Info ───────────────────────────────────────────────

  describe('env info', () => {
    it('shows env badge', () => {
      renderToolbar();
      expect(screen.getByText('development')).toBeInTheDocument();
    });

    it('shows SHA', () => {
      renderToolbar();
      expect(screen.getByText('abc1234')).toBeInTheDocument();
    });

    it('shows version', () => {
      renderToolbar();
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });

    it('applies red styling for production env', () => {
      renderToolbar({ env: 'production' });
      const badge = screen.getByText('production');
      expect(badge.className).toContain('text-red-400');
    });

    it('applies yellow styling for preview env', () => {
      renderToolbar({ env: 'preview' });
      const badge = screen.getByText('preview');
      expect(badge.className).toContain('text-yellow-400');
    });

    it('applies green styling for development env', () => {
      renderToolbar({ env: 'development' });
      const badge = screen.getByText('development');
      expect(badge.className).toContain('text-green-400');
    });
  });

  // ─── Admin Link ─────────────────────────────────────────────

  describe('admin link', () => {
    it('renders admin link in expanded actions row', () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      renderToolbar();

      const adminLink = screen.getByRole('link', { name: 'Admin panel' });
      expect(adminLink).toHaveAttribute('href', '/app/admin');
    });
  });

  // ─── Expand/Collapse ───────────────────────────────────────

  describe('expand/collapse', () => {
    it('toggles expand state', () => {
      renderToolbar();

      fireEvent.click(
        screen.getByRole('button', { name: 'Expand dev toolbar' })
      );
      expect(localStorage.getItem(TOOLBAR_OPEN_KEY)).toBe('1');

      fireEvent.click(
        screen.getByRole('button', { name: 'Collapse dev toolbar' })
      );
      expect(localStorage.getItem(TOOLBAR_OPEN_KEY)).toBe('0');
    });
  });

  // ─── Clear Session ────────────────────────────────────────

  describe('clear session', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;
    let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, deleted: ['__session'] }),
      });
      vi.stubGlobal('fetch', fetchSpy);
      setTimeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation((() => 0) as typeof globalThis.setTimeout);
    });

    afterEach(() => {
      setTimeoutSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it('renders button with correct aria-label', () => {
      renderToolbar();
      expect(
        screen.getByRole('button', { name: 'Clear session' })
      ).toBeInTheDocument();
    });

    it('calls /api/dev/clear-session on click', () => {
      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'Clear session' }));
      expect(fetchSpy).toHaveBeenCalledWith('/api/dev/clear-session', {
        method: 'POST',
      });
    });

    it('preserves toolbar localStorage keys after clearing', async () => {
      localStorage.setItem(TOOLBAR_OPEN_KEY, '1');
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, '0');
      localStorage.setItem(FF_OVERRIDES_KEY, '{"a":true}');
      localStorage.setItem('jovie-theme', 'dark');

      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'Clear session' }));

      // Wait for non-toolbar keys to be cleared (proves async handler completed)
      await vi.waitFor(() => {
        expect(localStorage.getItem(FF_OVERRIDES_KEY)).toBeNull();
      });
      expect(localStorage.getItem('jovie-theme')).toBeNull();
      // Toolbar keys preserved
      expect(localStorage.getItem(TOOLBAR_OPEN_KEY)).toBe('1');
      expect(localStorage.getItem(TOOLBAR_HIDDEN_KEY)).toBe('0');
    });

    it('clears sessionStorage', async () => {
      sessionStorage.setItem('test-key', 'test-value');

      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'Clear session' }));

      await vi.waitFor(() => {
        expect(sessionStorage.getItem('test-key')).toBeNull();
      });
    });

    it('shows error state when fetch fails', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'Clear session' }));

      await vi.waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('shows error state when API returns failure', async () => {
      fetchSpy.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'forbidden' }),
      });

      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'Clear session' }));

      await vi.waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });
  });
});
