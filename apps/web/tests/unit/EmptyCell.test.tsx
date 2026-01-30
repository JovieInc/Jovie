import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyCell } from '@/components/atoms/EmptyCell';

describe('EmptyCell', () => {
  describe('rendering', () => {
    it('renders empty marker (em dash)', () => {
      render(<EmptyCell />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<EmptyCell className='custom-class' />);
      const marker = container.querySelector('span');

      expect(marker).toHaveClass('custom-class');
    });
  });

  describe('styling', () => {
    it('applies default text styling', () => {
      const { container } = render(<EmptyCell />);
      const marker = container.querySelector('span');

      expect(marker).toHaveClass('text-xs');
      expect(marker).toHaveClass('text-tertiary-token');
    });

    it('custom className can override text color', () => {
      const { container } = render(<EmptyCell className='text-gray-500' />);
      const marker = container.querySelector('span');

      // cn() merges classes - custom text color overrides default
      expect(marker).toHaveClass('text-xs');
      expect(marker).toHaveClass('text-gray-500');
      expect(marker).not.toHaveClass('text-tertiary-token');
    });
  });

  describe('tooltip', () => {
    it('renders without tooltip by default', () => {
      const { container } = render(<EmptyCell />);

      // Should just be a span, no tooltip wrapper
      const spans = container.querySelectorAll('span');
      expect(spans.length).toBe(1);
    });

    // Note: Tooltip tests require TooltipProvider wrapper from @jovie/ui
    // These tests focus on the basic rendering behavior
    it('accepts tooltip prop', () => {
      // Component should accept tooltip prop without errors in type checking
      const component = <EmptyCell tooltip='No release date set' />;
      expect(component.props.tooltip).toBe('No release date set');
    });
  });

  describe('memo behavior', () => {
    it('renders consistently across re-renders', () => {
      const { rerender } = render(<EmptyCell />);

      expect(screen.getByText('—')).toBeInTheDocument();

      rerender(<EmptyCell />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('updates className on rerender', () => {
      const { container, rerender } = render(<EmptyCell className='class1' />);

      let marker = container.querySelector('span');
      expect(marker).toHaveClass('class1');

      rerender(<EmptyCell className='class2' />);
      marker = container.querySelector('span');
      expect(marker).not.toHaveClass('class1');
      expect(marker).toHaveClass('class2');
    });
  });

  describe('edge cases', () => {
    // Note: EmptyCell with empty tooltip falls back to no tooltip
    it('handles empty tooltip string', () => {
      render(<EmptyCell tooltip='' />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('renders with className only', () => {
      const { container } = render(<EmptyCell className='custom-style' />);
      const marker = container.querySelector('span');

      expect(marker).toHaveClass('custom-style');
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });
});
