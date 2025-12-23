import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Badge, badgeVariants } from './badge';

describe('Badge', () => {
  it('renders with text', () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('applies default variant and size classes', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toContain('bg-btn-primary');
    expect(badge.className).toContain('h-6');
  });

  it('applies variant classes', () => {
    render(<Badge variant='success'>Success</Badge>);
    const badge = screen.getByText('Success');
    expect(badge.className).toContain('bg-emerald-500/10');
    expect(badge.className).toContain('text-emerald-700');
  });

  it('applies size classes', () => {
    render(<Badge size='sm'>Small</Badge>);
    const badge = screen.getByText('Small');
    expect(badge.className).toContain('h-5');
    expect(badge.className).toContain('text-xs');
  });

  it('applies lg size classes', () => {
    render(<Badge size='lg'>Large</Badge>);
    const badge = screen.getByText('Large');
    expect(badge.className).toContain('h-7');
    expect(badge.className).toContain('text-base');
  });

  it('forwards refs', () => {
    const ref = React.createRef<HTMLSpanElement>();
    render(<Badge ref={ref}>Ref Badge</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('has correct displayName', () => {
    expect(Badge.displayName).toBe('Badge');
  });

  it('renders startIcon', () => {
    render(
      <Badge startIcon={<span data-testid='start-icon'>•</span>}>
        With Start Icon
      </Badge>
    );
    expect(screen.getByTestId('start-icon')).toBeInTheDocument();
    expect(screen.getByText('With Start Icon')).toBeInTheDocument();
  });

  it('renders endIcon', () => {
    render(
      <Badge endIcon={<span data-testid='end-icon'>✓</span>}>
        With End Icon
      </Badge>
    );
    expect(screen.getByTestId('end-icon')).toBeInTheDocument();
    expect(screen.getByText('With End Icon')).toBeInTheDocument();
  });

  it('renders both startIcon and endIcon', () => {
    render(
      <Badge
        startIcon={<span data-testid='start-icon'>•</span>}
        endIcon={<span data-testid='end-icon'>×</span>}
      >
        Both Icons
      </Badge>
    );
    expect(screen.getByTestId('start-icon')).toBeInTheDocument();
    expect(screen.getByTestId('end-icon')).toBeInTheDocument();
    expect(screen.getByText('Both Icons')).toBeInTheDocument();
  });

  it('applies aria-hidden to icon wrappers', () => {
    render(
      <Badge
        startIcon={<span data-testid='start-icon'>•</span>}
        endIcon={<span data-testid='end-icon'>✓</span>}
      >
        Icons
      </Badge>
    );
    const startWrapper = screen.getByTestId('start-icon').parentElement;
    const endWrapper = screen.getByTestId('end-icon').parentElement;
    expect(startWrapper).toHaveAttribute('aria-hidden', 'true');
    expect(endWrapper).toHaveAttribute('aria-hidden', 'true');
  });

  it('merges custom className', () => {
    render(<Badge className='custom-class'>Custom</Badge>);
    const badge = screen.getByText('Custom');
    expect(badge.className).toContain('custom-class');
  });

  it('passes through additional props', () => {
    render(<Badge data-testid='badge-element'>Props</Badge>);
    expect(screen.getByTestId('badge-element')).toBeInTheDocument();
  });

  describe('badgeVariants', () => {
    it('returns correct classes for primary variant', () => {
      const classes = badgeVariants({ variant: 'primary' });
      expect(classes).toContain('bg-btn-primary');
      expect(classes).toContain('text-btn-primary-foreground');
    });

    it('returns correct classes for secondary variant', () => {
      const classes = badgeVariants({ variant: 'secondary' });
      expect(classes).toContain('bg-surface-2');
      expect(classes).toContain('text-primary-token');
    });

    it('returns correct classes for outline variant', () => {
      const classes = badgeVariants({ variant: 'outline' });
      expect(classes).toContain('border-border');
      expect(classes).toContain('bg-transparent');
    });

    it('returns correct classes for success variant', () => {
      const classes = badgeVariants({ variant: 'success' });
      expect(classes).toContain('bg-emerald-500/10');
    });

    it('returns correct classes for warning variant', () => {
      const classes = badgeVariants({ variant: 'warning' });
      expect(classes).toContain('bg-amber-500/10');
    });

    it('returns correct classes for error variant', () => {
      const classes = badgeVariants({ variant: 'error' });
      expect(classes).toContain('bg-red-500/10');
    });

    it('returns correct classes for info variant', () => {
      const classes = badgeVariants({ variant: 'info' });
      expect(classes).toContain('bg-blue-500/10');
    });

    it('returns correct classes for sm size', () => {
      const classes = badgeVariants({ size: 'sm' });
      expect(classes).toContain('h-5');
      expect(classes).toContain('text-xs');
    });

    it('returns correct classes for md size', () => {
      const classes = badgeVariants({ size: 'md' });
      expect(classes).toContain('h-6');
      expect(classes).toContain('text-sm');
    });

    it('returns correct classes for lg size', () => {
      const classes = badgeVariants({ size: 'lg' });
      expect(classes).toContain('h-7');
      expect(classes).toContain('text-base');
    });
  });
});
