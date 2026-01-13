import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnConfig } from '@/components/admin/table/molecules/ColumnToggleGroup';
import { useColumnVisibility } from '@/components/admin/table/useColumnVisibility';

const mockColumns: ColumnConfig[] = [
  { id: 'avatar', label: 'Creator', canToggle: false, defaultVisible: true },
  {
    id: 'social',
    label: 'Social Links',
    canToggle: true,
    defaultVisible: true,
  },
  { id: 'created', label: 'Created', canToggle: true, defaultVisible: true },
  { id: 'verified', label: 'Verified', canToggle: true, defaultVisible: false },
];

// Mock localStorage
let store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    store = {};
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useColumnVisibility', () => {
  beforeEach(() => {
    // Reset storage and all mocks including mockReturnValue
    store = {};
    vi.clearAllMocks();
    // Reset getItem to use store again (in case mockReturnValue was used)
    localStorageMock.getItem.mockImplementation(
      (key: string) => store[key] ?? null
    );
  });

  afterEach(() => {
    store = {};
  });

  it('initializes with default visibility from column config', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    expect(result.current.visibility).toEqual({
      avatar: true,
      social: true,
      created: true,
      verified: false,
    });
  });

  it('toggles column visibility', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    act(() => {
      result.current.toggleColumn('social', false);
    });

    expect(result.current.visibility.social).toBe(false);
    expect(result.current.isColumnVisible('social')).toBe(false);
  });

  it('does not allow toggling non-toggleable columns', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    act(() => {
      result.current.toggleColumn('avatar', false);
    });

    // Avatar should remain visible
    expect(result.current.visibility.avatar).toBe(true);
    expect(result.current.isColumnVisible('avatar')).toBe(true);
  });

  it('resets to default visibility', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    // Change some visibility
    act(() => {
      result.current.toggleColumn('social', false);
      result.current.toggleColumn('created', false);
      result.current.toggleColumn('verified', true);
    });

    // Reset to defaults
    act(() => {
      result.current.resetToDefaults();
    });

    expect(result.current.visibility).toEqual({
      avatar: true,
      social: true,
      created: true,
      verified: false,
    });
  });

  it('shows all toggleable columns', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    // Hide some columns first
    act(() => {
      result.current.toggleColumn('social', false);
      result.current.toggleColumn('created', false);
    });

    // Show all
    act(() => {
      result.current.showAll();
    });

    expect(result.current.visibility.social).toBe(true);
    expect(result.current.visibility.created).toBe(true);
    expect(result.current.visibility.verified).toBe(true);
  });

  it('hides all toggleable columns', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    act(() => {
      result.current.hideAll();
    });

    expect(result.current.visibility.social).toBe(false);
    expect(result.current.visibility.created).toBe(false);
    expect(result.current.visibility.verified).toBe(false);
    // Non-toggleable column should still be visible
    expect(result.current.visibility.avatar).toBe(true);
  });

  it('provides correct TanStack Table visibility format', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    // Initially verified is hidden (defaultVisible: false)
    expect(result.current.tanstackVisibility).toEqual({
      verified: false,
    });

    // Hide social column
    act(() => {
      result.current.toggleColumn('social', false);
    });

    // TanStack format only includes hidden columns (false values)
    expect(result.current.tanstackVisibility).toEqual({
      social: false,
      verified: false,
    });
  });

  it('correctly counts visible and hidden columns', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    // Initially: social (visible), created (visible), verified (hidden) - only counting toggleable
    expect(result.current.visibleCount).toBe(2);
    expect(result.current.hiddenCount).toBe(1);

    act(() => {
      result.current.toggleColumn('social', false);
    });

    expect(result.current.visibleCount).toBe(1);
    expect(result.current.hiddenCount).toBe(2);
  });

  it('persists visibility to localStorage', async () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
        persist: true,
      })
    );

    act(() => {
      result.current.toggleColumn('social', false);
    });

    // Wait for effect to run
    await vi.waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  it('loads visibility from localStorage on mount', () => {
    // Pre-populate localStorage
    localStorageMock.getItem.mockReturnValue(
      JSON.stringify({ social: false, created: false, verified: true })
    );

    renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
        persist: true,
      })
    );

    // Should have loaded the stored values
    expect(localStorageMock.getItem).toHaveBeenCalledWith('test-columns');
  });

  it('does not persist when persist is false', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
        persist: false,
      })
    );

    act(() => {
      result.current.toggleColumn('social', false);
    });

    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('isColumnVisible returns correct value for toggleable columns', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    expect(result.current.isColumnVisible('social')).toBe(true);
    expect(result.current.isColumnVisible('verified')).toBe(false);

    act(() => {
      result.current.toggleColumn('social', false);
    });

    expect(result.current.isColumnVisible('social')).toBe(false);
  });

  it('isColumnVisible always returns true for non-toggleable columns', () => {
    const { result } = renderHook(() =>
      useColumnVisibility({
        columns: mockColumns,
        storageKey: 'test-columns',
      })
    );

    expect(result.current.isColumnVisible('avatar')).toBe(true);

    // Even if we try to toggle it
    act(() => {
      result.current.toggleColumn('avatar', false);
    });

    expect(result.current.isColumnVisible('avatar')).toBe(true);
  });
});
