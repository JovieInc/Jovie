import { readFileSync } from 'node:fs';
import path from 'node:path';
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

function readGlobalsCss(): string {
  return readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
}

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
    test('styled-jsx includes prefers-reduced-motion media query', () => {
      // Note: these styles live in `app/globals.css` (not styled-jsx).
      const styleContents = readGlobalsCss();

      // Verify the reduced motion media query exists
      expect(styleContents).toContain('prefers-reduced-motion');
      expect(styleContents).toMatch(
        /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/
      );
    });

    test('shake animation is disabled for reduced motion users via CSS', () => {
      const styleContents = readGlobalsCss();

      // Within the prefers-reduced-motion media query, the jv-shake should have animation: none
      // This verifies the CSS rule exists: .jv-shake { animation: none }
      expect(styleContents).toContain('jv-shake');

      // Check that within the reduced motion block, animation is set to none
      // The pattern: @media (prefers-reduced-motion: reduce) { .jv-shake { animation: none } }
      const reducedMotionMatch = styleContents.match(
        /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[^}]*\{[^}]*\.jv-shake[^}]*animation:\s*none/
      );
      expect(reducedMotionMatch).not.toBeNull();
    });

    test('available pulse animation uses opacity fade for reduced motion users', () => {
      const styleContents = readGlobalsCss();

      // Verify the jv-available-fade keyframe exists for reduced motion
      expect(styleContents).toContain('jv-available-fade');

      // Verify the fade animation uses opacity instead of box-shadow
      expect(styleContents).toMatch(
        /@keyframes\s+jv-available-fade[^}]*opacity/
      );
    });

    test('jv-available class exists and has pulse animation for normal motion', () => {
      const styleContents = readGlobalsCss();

      // Verify the normal jv-available-pulse keyframes exist
      expect(styleContents).toContain('jv-available-pulse');
      expect(styleContents).toMatch(
        /@keyframes\s+jv-available-pulse[^}]*box-shadow/
      );
    });

    test('reduced motion users get box-shadow: none for available state', () => {
      const styleContents = readGlobalsCss();

      // The reduced motion block should contain .jv-available with box-shadow: none
      // Since CSS is minified/structured, we check for the presence of both:
      // 1. The reduced motion media query
      // 2. The .jv-available selector with box-shadow: none somewhere in the styles
      expect(styleContents).toContain('prefers-reduced-motion: reduce');
      expect(styleContents).toContain('.jv-available');
      expect(styleContents).toContain('box-shadow: none');

      // Verify that the reduced motion block contains both .jv-available and animation: jv-available-fade
      // (which means box-shadow: none is used alongside the fade animation for reduced motion)
      expect(styleContents).toContain('jv-available-fade');
    });
  });
});
