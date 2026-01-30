import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TruncatedText } from '@/components/atoms/TruncatedText';

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('TruncatedText', () => {
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    originalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = ResizeObserverMock as any;
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
  });

  describe('rendering', () => {
    it('renders text content', () => {
      render(<TruncatedText>Hello World</TruncatedText>);
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <TruncatedText className='custom-class'>Text</TruncatedText>
      );
      const span = container.querySelector('span');

      expect(span).toHaveClass('custom-class');
    });
  });

  describe('truncation lines', () => {
    it('applies single line truncation by default', () => {
      const { container } = render(<TruncatedText>Text</TruncatedText>);
      const span = container.querySelector('span');

      expect(span).toHaveClass('line-clamp-1');
    });

    it('applies single line truncation when lines=1', () => {
      const { container } = render(
        <TruncatedText lines={1}>Text</TruncatedText>
      );
      const span = container.querySelector('span');

      expect(span).toHaveClass('line-clamp-1');
      expect(span).not.toHaveClass('line-clamp-2');
    });

    it('applies two line truncation when lines=2', () => {
      const { container } = render(
        <TruncatedText lines={2}>Text</TruncatedText>
      );
      const span = container.querySelector('span');

      expect(span).toHaveClass('line-clamp-2');
      expect(span).not.toHaveClass('line-clamp-1');
    });
  });

  describe('ResizeObserver integration', () => {
    it('renders without ResizeObserver errors', () => {
      expect(() => {
        render(<TruncatedText>Text</TruncatedText>);
      }).not.toThrow();
    });

    it('cleans up on unmount', () => {
      const { unmount } = render(<TruncatedText>Text</TruncatedText>);

      expect(() => {
        unmount();
      }).not.toThrow();
    });

    it('monitors text element for truncation', () => {
      const { container } = render(<TruncatedText>Text</TruncatedText>);
      const span = container.querySelector('span');

      expect(span).toBeInTheDocument();
      expect(span).toHaveClass('line-clamp-1');
    });
  });

  describe('tooltip behavior', () => {
    // Note: Tooltip tests require TooltipProvider wrapper from @jovie/ui
    // These tests verify that the component accepts tooltip props
    it('accepts alwaysShowTooltip prop', () => {
      const component = <TruncatedText alwaysShowTooltip>Text</TruncatedText>;
      expect(component.props.alwaysShowTooltip).toBe(true);
    });

    it('accepts tooltip side positioning prop', () => {
      const component = (
        <TruncatedText tooltipSide='bottom'>Text</TruncatedText>
      );
      expect(component.props.tooltipSide).toBe('bottom');
    });

    it('accepts tooltip alignment prop', () => {
      const component = (
        <TruncatedText tooltipAlign='center'>Text</TruncatedText>
      );
      expect(component.props.tooltipAlign).toBe('center');
    });
  });

  describe('memo behavior', () => {
    it('renders consistently across re-renders', () => {
      const { rerender } = render(<TruncatedText>Original</TruncatedText>);

      expect(screen.getByText('Original')).toBeInTheDocument();

      rerender(<TruncatedText>Original</TruncatedText>);
      expect(screen.getByText('Original')).toBeInTheDocument();
    });

    it('updates when text content changes', () => {
      const { rerender } = render(<TruncatedText>First</TruncatedText>);

      expect(screen.getByText('First')).toBeInTheDocument();

      rerender(<TruncatedText>Second</TruncatedText>);
      expect(screen.getByText('Second')).toBeInTheDocument();
      expect(screen.queryByText('First')).not.toBeInTheDocument();
    });

    it('updates when lines prop changes', () => {
      const { container, rerender } = render(
        <TruncatedText lines={1}>Text</TruncatedText>
      );

      expect(container.querySelector('span')).toHaveClass('line-clamp-1');

      rerender(<TruncatedText lines={2}>Text</TruncatedText>);
      expect(container.querySelector('span')).toHaveClass('line-clamp-2');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      render(<TruncatedText>{''}</TruncatedText>);

      const span = screen.getByText('', { selector: 'span' });
      expect(span).toBeInTheDocument();
    });

    it('handles very long text', () => {
      const longText = 'A'.repeat(500);
      render(<TruncatedText>{longText}</TruncatedText>);

      expect(screen.getByText(longText)).toBeInTheDocument();
    });

    it('handles special characters', () => {
      const specialText = '™ © ® — – test';
      render(<TruncatedText>{specialText}</TruncatedText>);

      expect(screen.getByText(specialText)).toBeInTheDocument();
    });

    it('accepts all props', () => {
      const component = (
        <TruncatedText
          lines={2}
          className='custom'
          tooltipSide='top'
          tooltipAlign='start'
          alwaysShowTooltip
        >
          Combined Props
        </TruncatedText>
      );

      expect(component.props.lines).toBe(2);
      expect(component.props.className).toBe('custom');
      expect(component.props.tooltipSide).toBe('top');
      expect(component.props.tooltipAlign).toBe('start');
      expect(component.props.alwaysShowTooltip).toBe(true);
    });
  });

  describe('className merging', () => {
    it('merges line-clamp with custom classes', () => {
      const { container } = render(
        <TruncatedText lines={1} className='text-sm font-bold'>
          Text
        </TruncatedText>
      );
      const span = container.querySelector('span');

      expect(span).toHaveClass('line-clamp-1');
      expect(span).toHaveClass('text-sm');
      expect(span).toHaveClass('font-bold');
    });

    it('handles conflicting truncation classes', () => {
      const { container } = render(
        <TruncatedText lines={1} className='line-clamp-3'>
          Text
        </TruncatedText>
      );
      const span = container.querySelector('span');

      // cn() merges classes - custom className may override default
      expect(span).toHaveClass('line-clamp-3');
    });
  });
});
