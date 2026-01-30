import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_PATTERNS,
  BackgroundPattern,
} from '@/components/atoms/BackgroundPattern';

describe('BackgroundPattern', () => {
  describe('rendering', () => {
    it('renders background pattern', () => {
      const { container } = render(<BackgroundPattern />);
      const pattern = container.querySelector('div');

      expect(pattern).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <BackgroundPattern className='custom-class' />
      );
      const pattern = container.querySelector('div');

      expect(pattern).toHaveClass('custom-class');
    });

    it('has aria-hidden attribute', () => {
      const { container } = render(<BackgroundPattern />);
      const pattern = container.querySelector('div');

      expect(pattern).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('variants', () => {
    it('uses grid variant by default', () => {
      const { container } = render(<BackgroundPattern />);
      const pattern = container.querySelector('div');

      expect(pattern?.className).toContain('bg-[linear-gradient');
    });

    it('renders grid variant explicitly', () => {
      const { container } = render(<BackgroundPattern variant='grid' />);
      const pattern = container.querySelector('div');

      expect(pattern?.className).toContain('bg-[linear-gradient');
      expect(pattern?.className).toContain('bg-[size:50px_50px]');
    });

    it('renders dots variant', () => {
      const { container } = render(<BackgroundPattern variant='dots' />);
      const pattern = container.querySelector('div');

      expect(pattern?.className).toContain('bg-[radial-gradient');
      expect(pattern?.className).toContain('bg-[size:20px_20px]');
    });

    it('renders gradient variant', () => {
      const { container } = render(<BackgroundPattern variant='gradient' />);
      const pattern = container.querySelector('div');

      expect(pattern?.className).toContain('bg-gradient-to-br');
      expect(pattern?.className).toContain('from-purple-50');
      expect(pattern?.className).toContain('via-pink-50');
      expect(pattern?.className).toContain('to-orange-50');
    });
  });

  describe('dark mode', () => {
    it('grid variant has dark mode classes', () => {
      const { container } = render(<BackgroundPattern variant='grid' />);
      const pattern = container.querySelector('div');

      expect(pattern?.className).toContain('dark:bg-[linear-gradient');
    });

    it('dots variant has dark mode classes', () => {
      const { container } = render(<BackgroundPattern variant='dots' />);
      const pattern = container.querySelector('div');

      expect(pattern?.className).toContain('dark:bg-[radial-gradient');
    });

    it('gradient variant has dark mode classes', () => {
      const { container } = render(<BackgroundPattern variant='gradient' />);
      const pattern = container.querySelector('div');

      expect(pattern?.className).toContain('dark:from-gray-900');
      expect(pattern?.className).toContain('dark:via-purple-900/20');
      expect(pattern?.className).toContain('dark:to-gray-900');
    });
  });

  describe('positioning', () => {
    it('applies absolute positioning', () => {
      const { container } = render(<BackgroundPattern />);
      const pattern = container.querySelector('div');

      expect(pattern).toHaveClass('absolute');
    });

    it('applies inset-0 for full coverage', () => {
      const { container } = render(<BackgroundPattern />);
      const pattern = container.querySelector('div');

      expect(pattern).toHaveClass('inset-0');
    });
  });

  describe('BACKGROUND_PATTERNS constant', () => {
    it('exports BACKGROUND_PATTERNS object', () => {
      expect(BACKGROUND_PATTERNS).toBeDefined();
    });

    it('has grid pattern definition', () => {
      expect(BACKGROUND_PATTERNS.grid).toBeDefined();
      expect(BACKGROUND_PATTERNS.grid).toContain('bg-[linear-gradient');
      expect(BACKGROUND_PATTERNS.grid).toContain('bg-[size:50px_50px]');
    });

    it('has dots pattern definition', () => {
      expect(BACKGROUND_PATTERNS.dots).toBeDefined();
      expect(BACKGROUND_PATTERNS.dots).toContain('bg-[radial-gradient');
      expect(BACKGROUND_PATTERNS.dots).toContain('bg-[size:20px_20px]');
    });

    it('has gradient pattern definition', () => {
      expect(BACKGROUND_PATTERNS.gradient).toBeDefined();
      expect(BACKGROUND_PATTERNS.gradient).toContain('bg-gradient-to-br');
      expect(BACKGROUND_PATTERNS.gradient).toContain('from-purple-50');
    });

    it('grid pattern has dark mode variant', () => {
      expect(BACKGROUND_PATTERNS.grid).toContain('dark:bg-[linear-gradient');
    });

    it('dots pattern has dark mode variant', () => {
      expect(BACKGROUND_PATTERNS.dots).toContain('dark:bg-[radial-gradient');
    });

    it('gradient pattern has dark mode variant', () => {
      expect(BACKGROUND_PATTERNS.gradient).toContain('dark:from-gray-900');
    });
  });

  describe('className merging', () => {
    it('merges custom className with variant classes', () => {
      const { container } = render(
        <BackgroundPattern variant='grid' className='opacity-50 z-0' />
      );
      const pattern = container.querySelector('div');

      expect(pattern).toHaveClass('opacity-50');
      expect(pattern).toHaveClass('z-0');
      expect(pattern).toHaveClass('absolute');
      expect(pattern).toHaveClass('inset-0');
    });

    it('allows className to override positioning', () => {
      const { container } = render(
        <BackgroundPattern className='relative inset-auto' />
      );
      const pattern = container.querySelector('div');

      expect(pattern).toHaveClass('relative');
      expect(pattern).toHaveClass('inset-auto');
    });
  });

  describe('accessibility', () => {
    it('is decorative with aria-hidden', () => {
      const { container } = render(<BackgroundPattern />);
      const pattern = container.querySelector('div');

      expect(pattern).toHaveAttribute('aria-hidden', 'true');
    });

    it('maintains aria-hidden across all variants', () => {
      const variants: Array<'grid' | 'dots' | 'gradient'> = [
        'grid',
        'dots',
        'gradient',
      ];

      variants.forEach(variant => {
        const { container } = render(<BackgroundPattern variant={variant} />);
        const pattern = container.querySelector('div');

        expect(pattern).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('edge cases', () => {
    it('handles empty className gracefully', () => {
      const { container } = render(<BackgroundPattern className='' />);
      const pattern = container.querySelector('div');

      expect(pattern).toBeInTheDocument();
    });

    it('combines variant and className', () => {
      const { container } = render(
        <BackgroundPattern variant='dots' className='opacity-75' />
      );
      const pattern = container.querySelector('div');

      expect(pattern?.className).toContain('bg-[radial-gradient');
      expect(pattern).toHaveClass('opacity-75');
    });

    it('renders without errors when all props provided', () => {
      expect(() => {
        render(<BackgroundPattern variant='gradient' className='z-10' />);
      }).not.toThrow();
    });
  });

  describe('visual consistency', () => {
    it('maintains absolute positioning across variants', () => {
      const variants: Array<'grid' | 'dots' | 'gradient'> = [
        'grid',
        'dots',
        'gradient',
      ];

      variants.forEach(variant => {
        const { container } = render(<BackgroundPattern variant={variant} />);
        const pattern = container.querySelector('div');

        expect(pattern).toHaveClass('absolute', 'inset-0');
      });
    });

    it('maintains aria-hidden across custom classNames', () => {
      const { container } = render(
        <BackgroundPattern className='custom-class' />
      );
      const pattern = container.querySelector('div');

      expect(pattern).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('pattern details', () => {
    it('grid pattern has correct sizing', () => {
      const gridPattern = BACKGROUND_PATTERNS.grid;
      expect(gridPattern).toContain('bg-[size:50px_50px]');
    });

    it('dots pattern has correct sizing', () => {
      const dotsPattern = BACKGROUND_PATTERNS.dots;
      expect(dotsPattern).toContain('bg-[size:20px_20px]');
    });

    it('gradient pattern has correct color stops', () => {
      const gradientPattern = BACKGROUND_PATTERNS.gradient;
      expect(gradientPattern).toContain('from-purple-50');
      expect(gradientPattern).toContain('via-pink-50');
      expect(gradientPattern).toContain('to-orange-50');
    });

    it('grid pattern uses rgba with low opacity', () => {
      const gridPattern = BACKGROUND_PATTERNS.grid;
      expect(gridPattern).toContain('rgba(0,0,0,0.02)');
      expect(gridPattern).toContain('rgba(255,255,255,0.02)');
    });

    it('dots pattern uses rgba with low opacity', () => {
      const dotsPattern = BACKGROUND_PATTERNS.dots;
      expect(dotsPattern).toContain('rgba(0,0,0,0.1)');
      expect(dotsPattern).toContain('rgba(255,255,255,0.1)');
    });
  });
});
