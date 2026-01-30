import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spacer } from '@/components/atoms/Spacer';

describe('Spacer', () => {
  describe('rendering', () => {
    it('renders with default medium size', () => {
      const { container } = render(<Spacer />);
      const spacer = container.firstChild as HTMLElement;

      expect(spacer).toBeInTheDocument();
      expect(spacer).toHaveClass('h-12'); // md = 48px
    });

    it('applies custom className', () => {
      const { container } = render(<Spacer className='custom-class' />);
      const spacer = container.firstChild as HTMLElement;

      expect(spacer).toHaveClass('custom-class');
    });
  });

  describe('sizes', () => {
    it('renders small size', () => {
      const { container } = render(<Spacer size='sm' />);
      const spacer = container.firstChild as HTMLElement;

      expect(spacer).toHaveClass('h-8'); // 32px
    });

    it('renders medium size', () => {
      const { container } = render(<Spacer size='md' />);
      const spacer = container.firstChild as HTMLElement;

      expect(spacer).toHaveClass('h-12'); // 48px
    });

    it('renders large size', () => {
      const { container } = render(<Spacer size='lg' />);
      const spacer = container.firstChild as HTMLElement;

      expect(spacer).toHaveClass('h-16'); // 64px
    });

    it('renders extra large size', () => {
      const { container } = render(<Spacer size='xl' />);
      const spacer = container.firstChild as HTMLElement;

      expect(spacer).toHaveClass('h-24'); // 96px
    });
  });

  describe('accessibility', () => {
    it('is hidden from assistive technology', () => {
      const { container } = render(<Spacer />);
      const spacer = container.firstChild as HTMLElement;

      expect(spacer).toHaveAttribute('aria-hidden', 'true');
    });

    it('maintains aria-hidden across all sizes', () => {
      const sizes: Array<'sm' | 'md' | 'lg' | 'xl'> = ['sm', 'md', 'lg', 'xl'];

      sizes.forEach(size => {
        const { container } = render(<Spacer size={size} />);
        const spacer = container.firstChild as HTMLElement;
        expect(spacer).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('edge cases', () => {
    it('handles custom className with size', () => {
      const { container } = render(<Spacer size='lg' className='custom' />);
      const spacer = container.firstChild as HTMLElement;

      expect(spacer).toHaveClass('h-16');
      expect(spacer).toHaveClass('custom');
    });

    it('renders without errors when all props are provided', () => {
      expect(() => {
        render(<Spacer size='xl' className='test-class' />);
      }).not.toThrow();
    });

    it('custom className can override height', () => {
      const { container } = render(<Spacer size='sm' className='h-32' />);
      const spacer = container.firstChild as HTMLElement;

      // cn() merges classes - custom className overrides default
      expect(spacer).toHaveClass('h-32');
      expect(spacer).not.toHaveClass('h-8');
    });
  });
});
