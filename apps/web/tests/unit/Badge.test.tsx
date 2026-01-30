import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/components/atoms/Badge';

describe('Badge', () => {
  describe('rendering', () => {
    it('renders children text', () => {
      render(<Badge>New</Badge>);
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('renders with custom className', () => {
      const { container } = render(
        <Badge className='custom-class'>Badge</Badge>
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('custom-class');
    });

    it('applies tracking-tight class', () => {
      const { container } = render(<Badge>Text</Badge>);
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('tracking-tight');
    });
  });

  describe('emphasis prop', () => {
    it('uses default emphasis by default', () => {
      const { container } = render(<Badge>Default</Badge>);
      const badge = container.querySelector('span');

      // Default emphasis doesn't add bg-surface-1 or text-muted-foreground
      expect(badge).not.toHaveClass('bg-surface-1');
      expect(badge).not.toHaveClass('text-muted-foreground');
    });

    it('applies subtle emphasis styling', () => {
      const { container } = render(<Badge emphasis='subtle'>Subtle</Badge>);
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('text-muted-foreground');
    });

    it('applies default emphasis explicitly', () => {
      const { container } = render(<Badge emphasis='default'>Default</Badge>);
      const badge = container.querySelector('span');

      expect(badge).not.toHaveClass('bg-surface-1');
    });
  });

  describe('base badge props', () => {
    it('forwards other props to base badge', () => {
      const { container } = render(
        <Badge data-testid='test-badge'>Badge</Badge>
      );

      expect(
        container.querySelector('[data-testid="test-badge"]')
      ).toBeInTheDocument();
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to badge element', () => {
      const ref = { current: null as HTMLSpanElement | null };
      render(<Badge ref={ref}>Ref Badge</Badge>);

      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it('allows ref to access badge properties', () => {
      const ref = { current: null as HTMLSpanElement | null };
      render(<Badge ref={ref}>Text</Badge>);

      expect(ref.current?.textContent).toBe('Text');
    });
  });

  describe('edge cases', () => {
    it('handles empty children', () => {
      const { container } = render(<Badge></Badge>);
      const badge = container.querySelector('span');

      expect(badge).toBeInTheDocument();
    });

    it('handles complex children', () => {
      render(
        <Badge>
          <span>Complex</span> <strong>Content</strong>
        </Badge>
      );

      expect(screen.getByText('Complex')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('combines emphasis and custom className', () => {
      const { container } = render(
        <Badge emphasis='subtle' className='custom'>
          Combined
        </Badge>
      );
      const badge = container.querySelector('span');

      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('text-muted-foreground');
      expect(badge).toHaveClass('custom');
      expect(badge).toHaveClass('tracking-tight');
    });

    it('renders with very long text', () => {
      const longText = 'A'.repeat(100);
      render(<Badge>{longText}</Badge>);

      expect(screen.getByText(longText)).toBeInTheDocument();
    });
  });

  describe('displayName', () => {
    it('has correct displayName', () => {
      expect(Badge.displayName).toBe('Badge');
    });
  });
});
