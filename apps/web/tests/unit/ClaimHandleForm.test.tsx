import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

// Use hoisted mocks for shared state
const { mockPush, mockPrefetch, mockFetch, mockTrack } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockPrefetch: vi.fn(),
  mockFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ available: true }),
  }),
  mockTrack: vi.fn(),
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

vi.mock('@/lib/analytics', () => ({
  track: mockTrack,
}));

// Mock fetch for handle checking
global.fetch = mockFetch as unknown as typeof fetch;

import { ClaimHandleForm } from '@/features/home/claim-handle';

beforeEach(() => {
  mockPush.mockReset();
  mockPrefetch.mockReset();
  mockFetch.mockClear();
  mockTrack.mockReset();
  window.history.pushState({}, '', '/');
});

describe('ClaimHandleForm', () => {
  test('renders with proper accessibility attributes', () => {
    render(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    expect(input).toHaveAttribute('required');

    // No helper text shown when handle is empty (removed redundant hint)
    const helpText = screen.queryByText(/Your Jovie profile will live at/i);
    expect(helpText).not.toBeInTheDocument();
  });

  test('renders form element', () => {
    render(<ClaimHandleForm />);

    const form = document.querySelector('form');
    expect(form).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    expect(input).toBeInTheDocument();
  });

  test('shows claim button when handle is entered', () => {
    render(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    fireEvent.change(input, { target: { value: 'testhandle' } });

    // Claim button should appear
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  test('shows validation message for short handles', () => {
    render(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    fireEvent.change(input, { target: { value: 'ab' } }); // Too short

    // Helper text shows the validation error
    expect(
      screen.getByText(/Handle must be at least 3 characters/i)
    ).toBeInTheDocument();
  });

  test('does not inject inline animation styles (moved to globals.css)', () => {
    render(<ClaimHandleForm />);

    const styleTags = document.querySelectorAll('style');
    const styleContents = Array.from(styleTags)
      .map(tag => tag.textContent || '')
      .join('');

    // Only check for component-specific animation keyframes (not third-party CSS like Sonner)
    expect(styleContents).not.toContain('jv-shake');
    expect(styleContents).not.toContain('jv-available');
  });

  test('tracks landing claim submits only on /new', () => {
    window.history.pushState({}, '', APP_ROUTES.LANDING_NEW);

    render(<ClaimHandleForm />);

    fireEvent.change(
      screen.getByRole('textbox', { name: /choose your handle/i }),
      {
        target: { value: 'releasefanclub' },
      }
    );
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(mockTrack).toHaveBeenCalledWith('landing_cta_claim_handle', {
      section: 'final_cta',
      handle: 'releasefanclub',
    });
    expect(mockPush).toHaveBeenCalledWith(
      '/signup?redirect_url=%2Fonboarding%3Fhandle%3Dreleasefanclub'
    );
  });

  test('does not track landing claim submits outside /new', () => {
    render(<ClaimHandleForm />);

    fireEvent.change(
      screen.getByRole('textbox', { name: /choose your handle/i }),
      {
        target: { value: 'releasefanclub' },
      }
    );
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(mockTrack).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(
      '/signup?redirect_url=%2Fonboarding%3Fhandle%3Dreleasefanclub'
    );
  });
});
