import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));

// Mock feature flag overrides
vi.mock('@/lib/feature-flags/client', () => ({
  useFeatureFlagOverrides: () => ({
    overrides: {},
    setOverride: vi.fn(),
    removeOverride: vi.fn(),
    clearOverrides: vi.fn(),
  }),
}));

vi.mock('@/lib/feature-flags/shared', () => ({
  FEATURE_FLAG_KEYS: {},
  CODE_FLAG_KEYS: {},
  FEATURE_FLAGS: {},
}));

import { DevToolbar } from '@/components/features/dev/DevToolbar';

const TOOLBAR_HIDDEN_KEY = '__dev_toolbar_hidden';

function renderToolbar() {
  return render(<DevToolbar env='development' sha='abc123' version='1.0.0' />);
}

describe('DevToolbar hide/show', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.style.paddingBottom = '';
  });

  afterEach(() => {
    cleanup();
    document.body.style.paddingBottom = '';
  });

  it('shows the full toolbar when no localStorage key is set (first visit)', () => {
    renderToolbar();
    // After mount effect, hidden=false (null !== '1'), so toolbar is visible
    expect(screen.getByText('Dev Toolbar')).toBeInTheDocument();
  });

  it('shows the "Dev" pill when localStorage says hidden', () => {
    localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
    renderToolbar();
    expect(
      screen.getByRole('button', { name: 'Show dev toolbar' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Dev Toolbar')).not.toBeInTheDocument();
  });

  it('shows the full toolbar when the Dev pill is clicked', () => {
    localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Show dev toolbar' }));
    expect(screen.getByText('Dev Toolbar')).toBeInTheDocument();
  });

  it('persists hidden=false to localStorage when shown', () => {
    localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Show dev toolbar' }));
    expect(localStorage.getItem(TOOLBAR_HIDDEN_KEY)).toBe('0');
  });

  it('hides the toolbar when the X button is clicked', () => {
    renderToolbar();
    expect(screen.getByText('Dev Toolbar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide dev toolbar' }));
    expect(screen.queryByText('Dev Toolbar')).not.toBeInTheDocument();
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
    expect(screen.getByText('Dev Toolbar')).toBeInTheDocument();
  });

  it('restores hidden state from localStorage on mount', () => {
    localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
    renderToolbar();
    expect(screen.queryByText('Dev Toolbar')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show dev toolbar' })
    ).toBeInTheDocument();
  });

  it('clears body paddingBottom when toolbar is hidden', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Hide dev toolbar' }));
    expect(document.body.style.paddingBottom).toBe('');
  });
});
