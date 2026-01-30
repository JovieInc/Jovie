/**
 * Badge Component Tests
 *
 * Tests for the Badge atom component.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/components/atoms/Badge';

describe('Badge Component', () => {
  describe('rendering', () => {
    it('renders children text', () => {
      render(<Badge>Test Badge</Badge>);

      expect(screen.getByText('Test Badge')).toBeInTheDocument();
    });

    it('renders as a span element by default', () => {
      render(<Badge>Badge</Badge>);

      const badge = screen.getByText('Badge');
      expect(badge.tagName).toBe('SPAN');
    });
  });

  describe('emphasis variants', () => {
    it('applies default emphasis styling', () => {
      render(<Badge emphasis='default'>Default Badge</Badge>);

      const badge = screen.getByText('Default Badge');
      expect(badge).toHaveClass('tracking-tight');
      expect(badge).not.toHaveClass('bg-surface-1');
    });

    it('applies subtle emphasis styling', () => {
      render(<Badge emphasis='subtle'>Subtle Badge</Badge>);

      const badge = screen.getByText('Subtle Badge');
      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('text-muted-foreground');
    });

    it('uses default emphasis when not specified', () => {
      render(<Badge>No Emphasis Specified</Badge>);

      const badge = screen.getByText('No Emphasis Specified');
      expect(badge).not.toHaveClass('bg-surface-1');
    });
  });

  describe('custom styling', () => {
    it('accepts and applies custom className', () => {
      render(<Badge className='custom-class'>Custom Badge</Badge>);

      const badge = screen.getByText('Custom Badge');
      expect(badge).toHaveClass('custom-class');
      expect(badge).toHaveClass('tracking-tight');
    });

    it('merges custom className with base styles', () => {
      render(
        <Badge className='my-custom-style' emphasis='subtle'>
          Merged Styles
        </Badge>
      );

      const badge = screen.getByText('Merged Styles');
      expect(badge).toHaveClass('my-custom-style');
      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('tracking-tight');
    });
  });

  describe('pass-through props', () => {
    it('passes additional props to underlying component', () => {
      render(
        <Badge data-testid='test-badge' aria-label='Status badge'>
          Status
        </Badge>
      );

      const badge = screen.getByTestId('test-badge');
      expect(badge).toHaveAttribute('aria-label', 'Status badge');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to the badge element', () => {
      const ref = React.createRef<HTMLSpanElement>();

      render(<Badge ref={ref}>Ref Badge</Badge>);

      expect(ref.current).not.toBeNull();
      expect(ref.current?.textContent).toBe('Ref Badge');
    });
  });

  describe('displayName', () => {
    it('has correct displayName for debugging', () => {
      expect(Badge.displayName).toBe('Badge');
    });
  });
});
