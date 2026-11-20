import { Button, Link as UILink } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FooterLink } from '@/components/atoms/FooterLink';
import { NavLink } from '@/components/atoms/NavLink';

// Render next/link as a plain anchor (forwardRef so the Radix Slot chain in
// the canonical Link primitive can compose refs without warnings).
vi.mock('next/link', () => {
  const MockNextLink = React.forwardRef(
    ({ children, ...props }: any, ref: React.Ref<HTMLAnchorElement>) => (
      <a ref={ref} {...props}>
        {children}
      </a>
    )
  );
  MockNextLink.displayName = 'MockNextLink';
  return { default: MockNextLink };
});

/**
 * JOV-3574: the ad-hoc anchors (NavLink, FooterLink) and Button asChild
 * glass CTAs render through the canonical Link primitive from
 * packages/ui/atoms/link.tsx with their existing props/classes intact.
 *
 * These tests intentionally do NOT mock @jovie/ui: they exercise the real
 * primitive (and, for frosted Button href mode, the real Button -> Link Slot
 * chain). Drift T2.3 folded the former glass twin into Button variants.
 *
 * Note: ShellCtaButton was retired in the Wave 2 marketing CTA consolidation —
 * its consumers now render the canonical @jovie/ui Button directly.
 */
describe('canonical Link primitive migrations (JOV-3574)', () => {
  it('NavLink renders through the primitive with its props intact', () => {
    render(<NavLink href='/pricing'>Pricing</NavLink>);

    const link = screen.getByRole('link', { name: 'Pricing' });
    expect(link).toHaveAttribute('data-variant', 'link');
    expect(link).toHaveAttribute('data-state', 'idle');
    expect(link).toHaveAttribute('href', '/pricing');
    expect(link).toHaveClass('text-sm');
    expect(link).toHaveClass('text-muted-foreground');
  });

  it('NavLink primary keeps its button-styled appearance via Button asChild composition', () => {
    render(
      <NavLink href='/upgrade' variant='primary'>
        Upgrade
      </NavLink>
    );

    const link = screen.getByRole('link', { name: 'Upgrade' });
    // Button (asChild) owns the button-styled visual + data contract…
    expect(link).toHaveAttribute('data-variant', 'primary');
    expect(link).toHaveClass('bg-btn-primary');
    expect(link).toHaveClass('text-btn-primary-foreground');
    // …while the canonical Link primitive composed the anchor underneath it
    // (its base underline-offset survives).
    expect(link.className).toContain('underline-offset-4');
  });

  it('FooterLink renders through the primitive with tone and external security intact', () => {
    render(<FooterLink href='https://example.com'>External</FooterLink>);

    const link = screen.getByRole('link', { name: 'External' });
    expect(link).toHaveAttribute('data-variant', 'link');
    expect(link).toHaveAttribute('data-state', 'idle');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    expect(link).toHaveClass('text-white/70');
  });

  it('FooterLink light tone keeps its token palette', () => {
    render(
      <FooterLink href='/privacy' tone='light'>
        Privacy
      </FooterLink>
    );

    const link = screen.getByRole('link', { name: 'Privacy' });
    expect(link).toHaveAttribute('data-variant', 'link');
    expect(link).toHaveClass('text-secondary-token');
  });

  it('frosted Button href mode renders through the primitive under Button styling', async () => {
    const NextLink = (await import('next/link')).default;
    render(
      <Button asChild variant='frosted'>
        <UILink asChild variant={null}>
          <NextLink href='/signup'>Sign Up</NextLink>
        </UILink>
      </Button>
    );

    const link = screen.getByRole('link', { name: 'Sign Up' });
    // Button (asChild) still owns the visual contract and data attributes…
    expect(link).toHaveAttribute('data-variant', 'frosted');
    expect(link).toHaveAttribute('href', '/signup');
    // …while the anchor is composed by the canonical Link primitive (its
    // base underline-offset survives) and keeps the frosted treatment.
    expect(link.className).toContain('underline-offset-4');
    expect(link.className).toContain('backdrop-blur-sm');
    expect(link.className).toContain('bg-icon-button-frosted');
  });

  it('frosted Button external href keeps target and rel', async () => {
    const NextLink = (await import('next/link')).default;
    render(
      <Button asChild variant='frosted-outline'>
        <UILink asChild variant={null}>
          <NextLink
            href='https://jov.ie'
            target='_blank'
            rel='noopener noreferrer'
          >
            Open
          </NextLink>
        </UILink>
      </Button>
    );

    const link = screen.getByRole('link', { name: 'Open' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('data-variant', 'frosted-outline');
  });
});
