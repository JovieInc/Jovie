import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FooterLink } from '@/components/atoms/FooterLink';
import { FrostedButton } from '@/components/atoms/FrostedButton';
import { NavLink } from '@/components/atoms/NavLink';
import { ShellCtaButton } from '@/components/marketing/artist-profile/ShellCtaButton';

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
 * JOV-3574: the four ad-hoc anchors (NavLink, FooterLink, FrostedButton,
 * ShellCtaButton) render through the canonical Link primitive from
 * packages/ui/atoms/link.tsx with their existing props/classes intact.
 *
 * These tests intentionally do NOT mock @jovie/ui: they exercise the real
 * primitive (and, for FrostedButton, the real Button -> Link Slot chain).
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

  it('FrostedButton href mode renders through the primitive under Button styling', () => {
    render(<FrostedButton href='/signup'>Sign Up</FrostedButton>);

    const link = screen.getByRole('link', { name: 'Sign Up' });
    // Button (asChild) still owns the visual contract and data attributes…
    expect(link).toHaveAttribute('data-variant', 'secondary');
    expect(link).toHaveAttribute('href', '/signup');
    // …while the anchor is composed by the canonical Link primitive (its
    // base underline-offset survives) and keeps the frosted treatment.
    expect(link.className).toContain('underline-offset-4');
    expect(link.className).toContain('backdrop-blur-md');
  });

  it('FrostedButton external href keeps target and rel', () => {
    render(
      <FrostedButton href='https://jov.ie' external>
        Open
      </FrostedButton>
    );

    const link = screen.getByRole('link', { name: 'Open' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('ShellCtaButton renders through the primitive with CTA pill classes intact', () => {
    render(<ShellCtaButton href='/claim'>Claim Your Profile</ShellCtaButton>);

    const link = screen.getByRole('link', { name: 'Claim Your Profile' });
    expect(link).toHaveAttribute('data-variant', 'link');
    expect(link).toHaveAttribute('data-state', 'idle');
    expect(link).toHaveAttribute('href', '/claim');
    expect(link.className).toContain('rounded-full');
    expect(link.className).toContain('bg-primary-token');
    expect(link.className).toContain('h-11');
  });

  it('ShellCtaButton on-dark secondary keeps its tone classes', () => {
    render(
      <ShellCtaButton href='/docs' tone='secondary' context='on-dark' size='lg'>
        Docs
      </ShellCtaButton>
    );

    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link.className).toContain('text-white');
    expect(link.className).toContain('h-12');
  });
});
