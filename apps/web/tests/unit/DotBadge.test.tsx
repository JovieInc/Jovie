import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DotBadge } from '@/components/atoms/DotBadge';

describe('DotBadge', () => {
  const defaultVariant = {
    className: 'border-info bg-info-subtle text-info',
    dotClassName: 'bg-info',
  };

  describe('rendering', () => {
    it('renders label text', () => {
      render(<DotBadge label='Active' variant={defaultVariant} />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders with custom className', () => {
      render(
        <DotBadge
          label='Test'
          variant={defaultVariant}
          className='custom-class'
        />
      );
      const badge = screen.getByText('Test').closest('span');

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
      render(<DotBadge label='Medium' variant={defaultVariant} />);
      const badge = screen.getByText('Medium').closest('span');

      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('py-0.5');
      expect(badge).toHaveClass('text-2xs');
    });

    it('renders small size', () => {
      render(<DotBadge label='Small' variant={defaultVariant} size='sm' />);
      const badge = screen.getByText('Small').closest('span');

      expect(badge).toHaveClass('px-1.5');
      expect(badge).toHaveClass('text-3xs');
    });

    it('renders medium size explicitly', () => {
      render(<DotBadge label='Medium' variant={defaultVariant} size='md' />);
      const badge = screen.getByText('Medium').closest('span');

      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('text-2xs');
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
        className: 'border-success bg-success-subtle text-success',
        dotClassName: 'bg-success',
      };

      render(<DotBadge label='Success' variant={successVariant} />);
      const badge = screen.getByText('Success').closest('span');

      expect(badge).toHaveClass('border-success');
      expect(badge).toHaveClass('bg-success-subtle');
      expect(badge).toHaveClass('text-success');
    });

    it('applies variant dotClassName to dot', () => {
      const warningVariant = {
        className: 'border-warning bg-warning-subtle text-warning',
        dotClassName: 'bg-warning',
      };

      const { container } = render(
        <DotBadge label='Warning' variant={warningVariant} />
      );
      const dot = container.querySelector('[aria-hidden]');

      expect(dot).toHaveClass('bg-warning');
    });

    it('supports multiple variant styles', () => {
      const customVariant = {
        className: 'border-accent bg-accent-subtle text-accent font-bold',
        dotClassName: 'bg-accent shadow-lg',
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
      render(
        <DotBadge
          label='Active'
          variant={defaultVariant}
          title='Currently active status'
        />
      );
      const badge = screen.getByText('Active').closest('span');

      expect(badge).toHaveAttribute('title', 'Currently active status');
    });

    it('renders without title by default', () => {
      render(<DotBadge label='Status' variant={defaultVariant} />);
      const badge = screen.getByText('Status').closest('span');

      expect(badge).not.toHaveAttribute('title');
    });
  });

  describe('styling', () => {
    it('applies base badge classes', () => {
      render(<DotBadge label='Badge' variant={defaultVariant} />);
      const badge = screen.getByText('Badge').closest('span');

      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge?.className).toContain('rounded-(--system-b-radius-pill)');
      expect(badge).toHaveClass('border');
      expect(badge).toHaveClass('font-[510]');
      expect(badge).toHaveClass('tracking-tight');
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
      render(<DotBadge label='Badge' variant={defaultVariant} />);
      const badge = screen.getByText('Badge').closest('span');

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
      const badge = container.querySelector('[title], span');

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
      render(
        <DotBadge
          label='Full'
          variant={defaultVariant}
          size='sm'
          title='Tooltip'
          className='extra-class'
        />
      );
      const badge = screen.getByText('Full').closest('span');

      expect(badge).toHaveClass('px-1.5');
      expect(badge).toHaveClass('extra-class');
      expect(badge).toHaveAttribute('title', 'Tooltip');
      expect(screen.getByText('Full')).toBeInTheDocument();
    });
  });
});
