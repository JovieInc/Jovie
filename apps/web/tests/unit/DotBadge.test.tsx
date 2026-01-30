import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DotBadge } from '@/components/atoms/DotBadge';

describe('DotBadge', () => {
  const defaultVariant = {
    className: 'border-blue-500 bg-blue-100 text-blue-700',
    dotClassName: 'bg-blue-500',
  };

  describe('rendering', () => {
    it('renders label text', () => {
      render(<DotBadge label='Active' variant={defaultVariant} />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders with custom className', () => {
      const { container } = render(
        <DotBadge
          label='Test'
          variant={defaultVariant}
          className='custom-class'
        />
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('custom-class');
    });

    it('renders dot indicator', () => {
      const { container } = render(
        <DotBadge label='Status' variant={defaultVariant} />
      );

      // Dot should have aria-hidden
      const dot = container.querySelector('[aria-hidden]');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveClass('rounded-full');
    });
  });

  describe('sizes', () => {
    it('renders medium size by default', () => {
      const { container } = render(
        <DotBadge label='Medium' variant={defaultVariant} />
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('py-0.5');
      expect(badge).toHaveClass('text-[11px]');
    });

    it('renders small size', () => {
      const { container } = render(
        <DotBadge label='Small' variant={defaultVariant} size='sm' />
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('px-1.5');
      expect(badge).toHaveClass('text-[10px]');
    });

    it('renders medium size explicitly', () => {
      const { container } = render(
        <DotBadge label='Medium' variant={defaultVariant} size='md' />
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('text-[11px]');
    });

    it('applies correct dot size for small', () => {
      const { container } = render(
        <DotBadge label='Small' variant={defaultVariant} size='sm' />
      );
      const dot = container.querySelector('[aria-hidden]');

      expect(dot).toHaveClass('size-1');
    });

    it('applies correct dot size for medium', () => {
      const { container } = render(
        <DotBadge label='Medium' variant={defaultVariant} size='md' />
      );
      const dot = container.querySelector('[aria-hidden]');

      expect(dot).toHaveClass('size-1.5');
    });
  });

  describe('variants', () => {
    it('applies variant className to badge', () => {
      const successVariant = {
        className: 'border-green-500 bg-green-100 text-green-700',
        dotClassName: 'bg-green-500',
      };

      const { container } = render(
        <DotBadge label='Success' variant={successVariant} />
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('border-green-500');
      expect(badge).toHaveClass('bg-green-100');
      expect(badge).toHaveClass('text-green-700');
    });

    it('applies variant dotClassName to dot', () => {
      const warningVariant = {
        className: 'border-yellow-500 bg-yellow-100 text-yellow-700',
        dotClassName: 'bg-yellow-500',
      };

      const { container } = render(
        <DotBadge label='Warning' variant={warningVariant} />
      );
      const dot = container.querySelector('[aria-hidden]');

      expect(dot).toHaveClass('bg-yellow-500');
    });

    it('supports multiple variant styles', () => {
      const customVariant = {
        className: 'border-purple-500 bg-purple-100 text-purple-700 font-bold',
        dotClassName: 'bg-purple-500 shadow-lg',
      };

      const { container } = render(
        <DotBadge label='Custom' variant={customVariant} />
      );
      const badge = container.querySelector('span');
      const dot = container.querySelector('[aria-hidden]');

      expect(badge).toHaveClass('font-bold');
      expect(dot).toHaveClass('shadow-lg');
    });
  });

  describe('accessibility', () => {
    it('dot has aria-hidden attribute', () => {
      const { container } = render(
        <DotBadge label='Status' variant={defaultVariant} />
      );
      const dot = container.querySelector('[aria-hidden]');

      expect(dot).toHaveAttribute('aria-hidden');
    });

    it('supports title attribute for tooltip', () => {
      const { container } = render(
        <DotBadge
          label='Active'
          variant={defaultVariant}
          title='Currently active status'
        />
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveAttribute('title', 'Currently active status');
    });

    it('renders without title by default', () => {
      const { container } = render(
        <DotBadge label='Status' variant={defaultVariant} />
      );
      const badge = container.querySelector('span');

      expect(badge).not.toHaveAttribute('title');
    });
  });

  describe('styling', () => {
    it('applies base badge classes', () => {
      const { container } = render(
        <DotBadge label='Badge' variant={defaultVariant} />
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('rounded-full');
      expect(badge).toHaveClass('border');
      expect(badge).toHaveClass('font-medium');
      expect(badge).toHaveClass('tracking-wide');
    });

    it('applies dot base classes', () => {
      const { container } = render(
        <DotBadge label='Badge' variant={defaultVariant} />
      );
      const dot = container.querySelector('[aria-hidden]');

      expect(dot).toHaveClass('inline-block');
      expect(dot).toHaveClass('rounded-full');
      expect(dot).toHaveClass('shrink-0');
      expect(dot).toHaveClass('mr-1.5');
    });

    it('applies w-fit class', () => {
      const { container } = render(
        <DotBadge label='Badge' variant={defaultVariant} />
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('w-fit');
    });
  });

  describe('label content', () => {
    it('renders string label', () => {
      render(<DotBadge label='Text Label' variant={defaultVariant} />);
      expect(screen.getByText('Text Label')).toBeInTheDocument();
    });

    it('renders number label', () => {
      render(<DotBadge label={42} variant={defaultVariant} />);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders ReactNode label', () => {
      render(
        <DotBadge
          label={
            <span>
              Complex <strong>Label</strong>
            </span>
          }
          variant={defaultVariant}
        />
      );

      expect(screen.getByText('Complex')).toBeInTheDocument();
      expect(screen.getByText('Label')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles empty string label', () => {
      const { container } = render(
        <DotBadge label='' variant={defaultVariant} />
      );
      const badge = container.querySelector('span');

      // Badge should still render with empty label
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('inline-flex');
    });

    it('handles very long label', () => {
      const longLabel = 'A'.repeat(100);
      render(<DotBadge label={longLabel} variant={defaultVariant} />);

      expect(screen.getByText(longLabel)).toBeInTheDocument();
    });

    it('combines all props', () => {
      const { container } = render(
        <DotBadge
          label='Full'
          variant={defaultVariant}
          size='sm'
          title='Tooltip'
          className='extra-class'
        />
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('px-1.5');
      expect(badge).toHaveClass('extra-class');
      expect(badge).toHaveAttribute('title', 'Tooltip');
      expect(screen.getByText('Full')).toBeInTheDocument();
    });
  });
});
