import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';

describe('VerifiedBadge', () => {
  describe('rendering', () => {
    it('renders verified badge', () => {
      const { container } = render(<VerifiedBadge />);
      const badge = container.querySelector('span');

      expect(badge).toBeInTheDocument();
    });

    it('renders BadgeCheck icon', () => {
      const { container } = render(<VerifiedBadge />);
      const icon = container.querySelector('svg');

      expect(icon).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<VerifiedBadge className='custom-class' />);
      const badge = container.querySelector('span');

      expect(badge?.className).toContain('custom-class');
    });
  });

  describe('sizes', () => {
    it('uses medium size by default', () => {
      const { container } = render(<VerifiedBadge />);
      const icon = container.querySelector('svg');

      expect(icon).toHaveClass('h-4.5');
      expect(icon).toHaveClass('w-4.5');
    });

    it('renders small size', () => {
      const { container } = render(<VerifiedBadge size='sm' />);
      const icon = container.querySelector('svg');

      expect(icon).toHaveClass('h-4');
      expect(icon).toHaveClass('w-4');
    });

    it('renders medium size explicitly', () => {
      const { container } = render(<VerifiedBadge size='md' />);
      const icon = container.querySelector('svg');

      expect(icon).toHaveClass('h-4.5');
      expect(icon).toHaveClass('w-4.5');
    });

    it('renders large size', () => {
      const { container } = render(<VerifiedBadge size='lg' />);
      const icon = container.querySelector('svg');

      expect(icon).toHaveClass('h-5');
      expect(icon).toHaveClass('w-5');
    });
  });

  describe('accessibility', () => {
    it('has aria-label for accessibility', () => {
      const { container } = render(<VerifiedBadge />);
      const badge = container.querySelector('span');

      expect(badge).toHaveAttribute('aria-label', 'Verified Jovie Profile');
    });

    it('has title attribute for tooltip', () => {
      const { container } = render(<VerifiedBadge />);
      const badge = container.querySelector('span');

      expect(badge).toHaveAttribute('title', 'Verified Jovie Profile');
    });

    it('icon has aria-hidden attribute', () => {
      const { container } = render(<VerifiedBadge />);
      const icon = container.querySelector('svg');

      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('styling', () => {
    it('applies base badge classes', () => {
      const { container } = render(<VerifiedBadge />);
      const badge = container.querySelector('span');

      expect(badge?.className).toContain('inline-flex');
      expect(badge?.className).toContain('align-middle');
      expect(badge?.className).toContain('rounded-full');
      expect(badge?.className).toContain('bg-white');
      expect(badge?.className).toContain('dark:bg-base');
      expect(badge?.className).toContain('p-0.5');
    });

    it('applies text color classes', () => {
      const { container } = render(<VerifiedBadge />);
      const badge = container.querySelector('span');

      expect(badge?.className).toContain('text-sky-600');
      expect(badge?.className).toContain('dark:text-sky-400');
    });

    it('icon has fill and stroke properties', () => {
      const { container } = render(<VerifiedBadge />);
      const icon = container.querySelector('svg');

      expect(icon).toHaveAttribute('fill', 'currentColor');
      expect(icon).toHaveAttribute('stroke', 'white');
      expect(icon).toHaveAttribute('stroke-width', '2');
    });
  });

  describe('icon rendering', () => {
    it('renders BadgeCheck from lucide-react', () => {
      const { container } = render(<VerifiedBadge />);
      const icon = container.querySelector('svg');

      // BadgeCheck icon should be present
      expect(icon).toBeInTheDocument();
    });

    it('applies correct size classes to icon', () => {
      const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
      const expectedClasses = {
        sm: ['h-4', 'w-4'],
        md: ['h-4.5', 'w-4.5'],
        lg: ['h-5', 'w-5'],
      };

      sizes.forEach(size => {
        const { container } = render(<VerifiedBadge size={size} />);
        const icon = container.querySelector('svg');

        expectedClasses[size].forEach(className => {
          expect(icon).toHaveClass(className);
        });
      });
    });
  });

  describe('edge cases', () => {
    it('handles empty className', () => {
      const { container } = render(<VerifiedBadge className='' />);
      const badge = container.querySelector('span');

      expect(badge).toBeInTheDocument();
    });

    it('combines size and className', () => {
      const { container } = render(
        <VerifiedBadge size='lg' className='extra-class' />
      );
      const badge = container.querySelector('span');
      const icon = container.querySelector('svg');

      expect(badge?.className).toContain('extra-class');
      expect(icon).toHaveClass('h-5', 'w-5');
    });

    it('renders consistently across multiple instances', () => {
      const { container: container1 } = render(<VerifiedBadge />);
      const { container: container2 } = render(<VerifiedBadge />);

      const badge1 = container1.querySelector('span');
      const badge2 = container2.querySelector('span');

      expect(badge1?.getAttribute('aria-label')).toBe(
        badge2?.getAttribute('aria-label')
      );
    });

    it('renders without errors when all props provided', () => {
      expect(() => {
        render(<VerifiedBadge size='lg' className='custom' />);
      }).not.toThrow();
    });
  });

  describe('visual consistency', () => {
    it('maintains consistent padding across sizes', () => {
      const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];

      sizes.forEach(size => {
        const { container } = render(<VerifiedBadge size={size} />);
        const badge = container.querySelector('span');

        // All sizes should have same padding
        expect(badge?.className).toContain('p-0.5');
      });
    });

    it('maintains rounded-full across all sizes', () => {
      const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];

      sizes.forEach(size => {
        const { container } = render(<VerifiedBadge size={size} />);
        const badge = container.querySelector('span');

        expect(badge?.className).toContain('rounded-full');
      });
    });
  });
});
