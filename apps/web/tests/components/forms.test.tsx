import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorSummary } from '@/components/organisms/ErrorSummary';

// Mock the router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isSignedIn: true,
    has: () => false,
  }),
  useUser: () => ({
    user: { id: 'test-user-id' },
  }),
}));

describe('Form Accessibility and Validation', () => {
  describe('ErrorSummary Component', () => {
    it('renders error messages and provides focus functionality', async () => {
      const onFocusField = vi.fn();
      const errors = {
        name: 'Name is required',
        email: 'Email is invalid',
      };

      render(
        <ErrorSummary
          errors={errors}
          title='Please fix the errors'
          onFocusField={onFocusField}
        />
      );

      // Check title is rendered
      expect(screen.getByText('Please fix the errors')).toBeInTheDocument();
      const summary = screen.getByRole('alert');
      expect(summary).toHaveClass('bg-error-subtle', 'border-error/20');
      expect(summary).not.toHaveAttribute('aria-live');
      expect(summary).not.toHaveAttribute('aria-atomic');
      expect(summary.className).not.toMatch(/\b(?:bg|border|text|ring)-red-/);

      // Check error messages are rendered
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Email is invalid')).toBeInTheDocument();

      // Check focus functionality
      fireEvent.click(screen.getByText('Name is required'));
      expect(onFocusField).toHaveBeenCalledWith('name');
    });

    it('uses a unique heading id for each rendered summary', () => {
      render(
        <>
          <ErrorSummary errors={{ name: 'Name is required' }} />
          <ErrorSummary errors={{ email: 'Email is invalid' }} />
        </>
      );

      const labelledBy = screen
        .getAllByRole('alert')
        .map(summary => summary.getAttribute('aria-labelledby'));

      expect(new Set(labelledBy).size).toBe(2);
      expect(labelledBy.every(Boolean)).toBe(true);
    });

    it('does not render when there are no errors', () => {
      render(<ErrorSummary errors={{}} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
