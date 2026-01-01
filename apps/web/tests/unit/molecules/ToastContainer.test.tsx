import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/molecules/ToastContainer';

describe('ToastContainer', () => {
  describe('Safe Area Positioning', () => {
    it('renders with fixed positioning', () => {
      render(
        <ToastProvider>
          <div>Test content</div>
        </ToastProvider>
      );

      const toastContainer = screen.getByTestId('toast-stack');
      expect(toastContainer).toHaveClass('fixed');
    });

    it('uses safe area utility class for bottom positioning', () => {
      render(
        <ToastProvider>
          <div>Test content</div>
        </ToastProvider>
      );

      const toastContainer = screen.getByTestId('toast-stack');
      expect(toastContainer).toHaveClass('bottom-4-safe');
    });

    it('uses safe area utility class for right positioning', () => {
      render(
        <ToastProvider>
          <div>Test content</div>
        </ToastProvider>
      );

      const toastContainer = screen.getByTestId('toast-stack');
      expect(toastContainer).toHaveClass('right-4-safe');
    });

    it('has all required safe area and layout classes', () => {
      render(
        <ToastProvider>
          <div>Test content</div>
        </ToastProvider>
      );

      const toastContainer = screen.getByTestId('toast-stack');

      // Verify safe area positioning classes
      expect(toastContainer).toHaveClass('fixed');
      expect(toastContainer).toHaveClass('bottom-4-safe');
      expect(toastContainer).toHaveClass('right-4-safe');

      // Verify layout classes are preserved
      expect(toastContainer).toHaveClass('flex');
      expect(toastContainer).toHaveClass('flex-col');
      expect(toastContainer).toHaveClass('gap-2');
      expect(toastContainer).toHaveClass('z-50');
    });
  });

  describe('Container Structure', () => {
    it('renders children correctly', () => {
      render(
        <ToastProvider>
          <div data-testid='child-content'>Test content</div>
        </ToastProvider>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('renders toast-stack container element', () => {
      render(
        <ToastProvider>
          <div>Test content</div>
        </ToastProvider>
      );

      const toastContainer = screen.getByTestId('toast-stack');
      expect(toastContainer).toBeInTheDocument();
      expect(toastContainer.tagName).toBe('DIV');
    });
  });
});
