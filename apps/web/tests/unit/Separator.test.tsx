import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from '@/components/atoms/Separator';

/**
 * App Separator is a re-export of `@jovie/ui` Separator (one-system lock).
 * Asserts the package contract so we do not re-fork neutral gray pairs.
 */
describe('Separator', () => {
  describe('rendering', () => {
    it('renders with default horizontal orientation', () => {
      const { container } = render(<Separator />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toBeInTheDocument();
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('renders with vertical orientation', () => {
      const { container } = render(<Separator orientation='vertical' />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveAttribute('data-orientation', 'vertical');
    });

    it('applies custom className', () => {
      const { container } = render(<Separator className='custom-class' />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('custom-class');
    });
  });

  describe('accessibility', () => {
    it('renders with decorative prop', () => {
      const { container } = render(<Separator />);
      const separator = container.querySelector('[data-slot="separator"]');

      // Component should render with decorative=true by default
      expect(separator).toBeInTheDocument();
    });

    it('can be non-decorative', () => {
      render(<Separator decorative={false} />);
      const separator = screen.getByRole('separator');

      expect(separator).toBeInTheDocument();
    });

    it('has proper role when not decorative', () => {
      render(<Separator decorative={false} orientation='vertical' />);
      const separator = screen.getByRole('separator');

      expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    });
  });

  describe('styling', () => {
    it('applies canonical token background (not legacy neutral gray pair)', () => {
      const { container } = render(<Separator />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('bg-border');
      expect(separator).not.toHaveClass('bg-neutral-200');
      expect(separator).not.toHaveClass('dark:bg-neutral-800');
    });

    it('applies shrink-0 class', () => {
      const { container } = render(<Separator />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('shrink-0');
    });

    it('applies horizontal sizing classes', () => {
      const { container } = render(<Separator orientation='horizontal' />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('h-px');
      expect(separator).toHaveClass('w-full');
    });

    it('applies vertical sizing classes', () => {
      const { container } = render(<Separator orientation='vertical' />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('h-full');
      expect(separator).toHaveClass('w-px');
    });
  });

  describe('edge cases', () => {
    it('handles decorative prop with custom className', () => {
      const { container } = render(<Separator decorative className='custom' />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('custom');
      expect(separator).toBeInTheDocument();
    });

    it('renders without errors when all props are provided', () => {
      expect(() => {
        render(
          <Separator
            orientation='vertical'
            decorative={false}
            className='test-class'
          />
        );
      }).not.toThrow();
    });
  });
});
