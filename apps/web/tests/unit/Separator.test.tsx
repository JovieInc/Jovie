import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from '@/components/atoms/Separator';

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
    it('applies base background color classes', () => {
      const { container } = render(<Separator />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('bg-neutral-200');
      expect(separator).toHaveClass('dark:bg-neutral-800');
    });

    it('applies shrink-0 class', () => {
      const { container } = render(<Separator />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('shrink-0');
    });

    it('applies horizontal sizing classes', () => {
      const { container } = render(<Separator orientation='horizontal' />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('data-[orientation=horizontal]:h-px');
      expect(separator).toHaveClass('data-[orientation=horizontal]:w-full');
    });

    it('applies vertical sizing classes', () => {
      const { container } = render(<Separator orientation='vertical' />);
      const separator = container.querySelector('[data-slot="separator"]');

      expect(separator).toHaveClass('data-[orientation=vertical]:h-full');
      expect(separator).toHaveClass('data-[orientation=vertical]:w-px');
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
