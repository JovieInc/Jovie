import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';

describe('Badge', () => {
  describe('Basic Rendering', () => {
    it('renders with text content', () => {
      render(<Badge>New</Badge>);
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('renders as span element', () => {
      render(<Badge data-testid='badge'>New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.tagName).toBe('SPAN');
    });

    it('forwards refs correctly', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(<Badge ref={ref}>New</Badge>);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it('has correct displayName', () => {
      expect(Badge.displayName).toBe('Badge');
    });
  });

  describe('Variants', () => {
    it('applies primary variant by default', () => {
      render(<Badge data-testid='badge'>New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-btn-primary');
      expect(badge.className).toContain('text-btn-primary-foreground');
    });

    it('applies secondary variant', () => {
      render(
        <Badge variant='secondary' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-surface-1');
      expect(badge.className).toContain('text-primary-token');
    });

    it('applies success variant', () => {
      render(
        <Badge variant='success' data-testid='badge'>
          Active
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-emerald-500/10');
      expect(badge.className).toContain('text-emerald-600');
    });

    it('applies warning variant', () => {
      render(
        <Badge variant='warning' data-testid='badge'>
          Pending
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-amber-500/10');
      expect(badge.className).toContain('text-amber-600');
    });

    it('applies error variant', () => {
      render(
        <Badge variant='error' data-testid='badge'>
          Failed
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-red-500/10');
      expect(badge.className).toContain('text-red-600');
    });
  });

  describe('Sizes', () => {
    it('applies md size by default', () => {
      render(<Badge data-testid='badge'>New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('text-sm');
      expect(badge.className).toContain('px-2.5');
    });

    it('applies sm size', () => {
      render(
        <Badge size='sm' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('text-xs');
      expect(badge.className).toContain('px-2');
    });

    it('applies lg size', () => {
      render(
        <Badge size='lg' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('text-base');
      expect(badge.className).toContain('px-3');
    });
  });

  describe('Styling', () => {
    it('applies base styling classes', () => {
      render(<Badge data-testid='badge'>New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('inline-flex');
      expect(badge.className).toContain('items-center');
      expect(badge.className).toContain('rounded-full');
      expect(badge.className).toContain('font-semibold');
    });

    it('merges custom className', () => {
      render(
        <Badge className='custom-class' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('custom-class');
      expect(badge.className).toContain('rounded-full');
    });
  });

  describe('HTML Attributes', () => {
    it('passes through HTML attributes', () => {
      render(
        <Badge id='custom-id' title='Badge title' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('id', 'custom-id');
      expect(badge).toHaveAttribute('title', 'Badge title');
    });

    it('supports onClick handler', () => {
      const onClick = vi.fn();
      render(
        <Badge onClick={onClick} data-testid='badge'>
          Clickable
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      badge.click();
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe('Content', () => {
    it('renders with icon and text', () => {
      render(
        <Badge data-testid='badge'>
          <span data-testid='icon'>★</span>
          Featured
        </Badge>
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Featured')).toBeInTheDocument();
    });

    it('renders numeric content', () => {
      render(<Badge>42</Badge>);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders empty badge', () => {
      render(<Badge data-testid='badge' />);
      const badge = screen.getByTestId('badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toBeEmptyDOMElement();
    });
  });
});

// Need to import vi for the onClick test
import { vi } from 'vitest';
