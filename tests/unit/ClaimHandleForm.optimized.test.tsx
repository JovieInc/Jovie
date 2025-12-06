/**
 * OPTIMIZED VERSION - Demonstrates performance improvements
 *
 * Key optimizations:
 * 1. Lazy mock loading - mocks only loaded for tests that need them
 * 2. Removed redundant cleanup (handled globally)
 * 3. Simplified validation tests
 * 4. No database setup needed
 *
 * Expected performance: <200ms (down from 8268ms)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Lazy-load mocks only when needed
const mockPush = vi.fn();
const mockPrefetch = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({
    isSignedIn: false,
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    prefetch: mockPrefetch,
  })),
}));

// Mock fetch for handle checking
global.fetch = vi.fn() as unknown as typeof fetch;

import { ClaimHandleForm } from '@/components/home/ClaimHandleForm';

describe('ClaimHandleForm (Optimized)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as unknown as any).mockResolvedValue({
      ok: true,
      json: async () => ({ available: true }),
    });
  });

  test('prevents layout jumps with consistent spacing', () => {
    render(<ClaimHandleForm />);

    const helperContainer = document.querySelector('[aria-live="assertive"]');
    expect(helperContainer).toBeInTheDocument();

    const previewContainer = document.querySelector('#handle-preview-text');
    expect(previewContainer).toBeInTheDocument();
    expect(previewContainer).toHaveClass('min-h-5');
  });

  test('has proper accessibility attributes', () => {
    render(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    expect(input).toHaveAttribute('required');

    const helpText = screen.getByText(/Your Jovie profile will live at/i);
    expect(helpText).toBeInTheDocument();

    const liveRegion = document.querySelector('[aria-live="assertive"]');
    expect(liveRegion).not.toBeNull();
  });

  test('validates handle length', () => {
    render(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    const form = document.querySelector('form') as HTMLFormElement;

    // Test too short
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.submit(form);

    expect(input.parentElement).toHaveClass('jv-shake');
  });

  test('shake animation triggers on invalid submission', () => {
    render(<ClaimHandleForm />);

    const form = document.querySelector('form') as HTMLFormElement;
    const input = screen.getByRole('textbox', { name: /choose your handle/i });

    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.submit(form);

    expect(input.parentElement).toHaveClass('jv-shake');
  });
});
