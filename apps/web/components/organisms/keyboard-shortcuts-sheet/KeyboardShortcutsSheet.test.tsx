import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/KeyboardShortcutsContext', () => ({
  useKeyboardShortcuts: () => ({
    isOpen: true,
    close: vi.fn(),
    query: '',
    setQuery: vi.fn(),
    results: [],
  }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { children: unknown }) => children,
  },
}));

import { KeyboardShortcutsSheet } from './KeyboardShortcutsSheet';

describe('KeyboardShortcutsSheet', () => {
  it('renders the shortcuts sheet title when open', () => {
    render(<KeyboardShortcutsSheet />);
    expect(screen.getByText(/shortcut/i)).toBeTruthy();
  });
});
