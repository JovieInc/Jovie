import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use hoisted mocks for shared state
const { mockPush, mockPrefetch, mockFetch } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockPrefetch: vi.fn(),
  mockFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ available: true }),
  }),
}));

// Mock dependencies
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isSignedIn: false,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    prefetch: mockPrefetch,
  }),
}));

// Mock fetch for handle checking
global.fetch = mockFetch as unknown as typeof fetch;

import { ClaimHandleForm } from '@/components/home/claim-handle';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockPush.mockReset();
  mockPrefetch.mockReset();
  mockFetch.mockClear();
});

describe('ClaimHandleForm', () => {
  test('renders with proper accessibility attributes', () => {
    renderWithQueryClient(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    expect(input).toHaveAttribute('required');

    // No helper text shown when handle is empty (removed redundant hint)
    const helpText = screen.queryByText(/Your Jovie profile will live at/i);
    expect(helpText).not.toBeInTheDocument();
  });

  test('renders form element', () => {
    renderWithQueryClient(<ClaimHandleForm />);

    const form = document.querySelector('form');
    expect(form).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    expect(input).toBeInTheDocument();
  });

  test('shows claim button when handle is entered', () => {
    renderWithQueryClient(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    fireEvent.change(input, { target: { value: 'testhandle' } });

    // Claim button should appear
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  test('shows validation message for short handles', () => {
    renderWithQueryClient(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    fireEvent.change(input, { target: { value: 'ab' } }); // Too short

    // Helper text shows the validation error
    expect(
      screen.getByText(/Handle must be at least 3 characters/i)
    ).toBeInTheDocument();
  });

  test('does not inject inline animation styles (moved to globals.css)', () => {
    renderWithQueryClient(<ClaimHandleForm />);

    const styleTags = document.querySelectorAll('style');
    const styleContents = Array.from(styleTags)
      .map(tag => tag.textContent || '')
      .join('');

    expect(styleContents).not.toContain('prefers-reduced-motion');
    expect(styleContents).not.toContain('jv-shake');
    expect(styleContents).not.toContain('jv-available');
  });
});
