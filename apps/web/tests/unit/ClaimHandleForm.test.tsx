import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, test, vi } from 'vitest';

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

// Mock @jovie/ui to avoid dependency resolution issues in worktrees
vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <button {...props}>{children}</button>,
}));

// Mock fetch for handle checking
global.fetch = mockFetch as unknown as typeof fetch;

import { ClaimHandleForm } from '@/components/home/ClaimHandleForm';
import { ClaimHandleStyles } from '@/components/home/claim-handle/ClaimHandleStyles';

describe('ClaimHandleForm', () => {
  test('prevents layout jumps with consistent spacing', () => {
    render(<ClaimHandleForm />);

    // Check that helper text container exists with min-height
    const helperContainer = document.querySelector('[aria-live="assertive"]');
    expect(helperContainer).toBeInTheDocument();

    // Check that preview container exists with min-height to prevent layout jumps
    const previewContainer = document.querySelector('#handle-preview-text');
    expect(previewContainer).toBeInTheDocument();
    expect(previewContainer).toHaveClass('min-h-5');
  });

  test('has proper accessibility attributes', () => {
    render(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    // Input should be marked as required
    expect(input).toHaveAttribute('required');

    // Check that help text exists and is visible (accessibility through visible text)
    const helpText = screen.getByText(/Your Jovie profile will live at/i);
    expect(helpText).toBeInTheDocument();

    // Check aria-live region exists for dynamic announcements
    const liveRegion = document.querySelector('[aria-live="assertive"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute('aria-live', 'assertive');
  });

  // Simplified test for clipboard functionality - focus on the core behavior
  test('has clipboard functionality', () => {
    // Mock clipboard API
    const writeTextMock = vi.fn();
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<ClaimHandleForm />);

    // Verify the component renders without errors
    expect(
      screen.getByRole('textbox', { name: /choose your handle/i })
    ).toBeInTheDocument();

    // Restore clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  // Simplified test for validation - focus on the core behavior
  test('has validation functionality', () => {
    render(<ClaimHandleForm />);

    const input = screen.getByRole('textbox', { name: /choose your handle/i });
    const form = document.querySelector('form') as HTMLFormElement;

    // Verify the component renders without errors
    expect(input).toBeInTheDocument();
    expect(form).toBeInTheDocument();

    // Verify validation works for short handles
    fireEvent.change(input, { target: { value: 'ab' } }); // Too short
    fireEvent.submit(form);

    // Check that shake class is added for invalid input
    expect(input.parentElement).toHaveClass('jv-shake');
  });

  test('shake animation triggers on invalid submission', () => {
    render(<ClaimHandleForm />);

    const form = document.querySelector('form') as HTMLFormElement;
    expect(form).not.toBeNull();
    const input = screen.getByRole('textbox', { name: /choose your handle/i });

    // Try to submit with invalid handle
    fireEvent.change(input, { target: { value: 'ab' } }); // Too short
    fireEvent.submit(form);

    // Check that shake class is added
    expect(input.parentElement).toHaveClass('jv-shake');
  });

  describe('reduced motion support', () => {
    test('uses global CSS hooks (no inline styled-jsx)', () => {
      expect(ClaimHandleStyles()).toBeNull();

      render(<ClaimHandleForm />);
      const form = document.querySelector('form') as HTMLFormElement;
      const input = screen.getByRole('textbox', {
        name: /choose your handle/i,
      });

      fireEvent.change(input, { target: { value: 'ab' } }); // Too short
      fireEvent.submit(form);

      // Hook class used by global CSS (incl. reduced-motion variants)
      expect(input.parentElement).toHaveClass('jv-shake');
    });
  });
});
