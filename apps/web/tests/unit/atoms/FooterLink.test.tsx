import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FooterLink } from '@/components/atoms/FooterLink';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

describe('FooterLink', () => {
  it('renders children as a link', () => {
    render(<FooterLink href='/about'>About</FooterLink>);
    const link = screen.getByRole('link', { name: 'About' });
    expect(link).toBeInTheDocument();
  });

  it('renders with correct href', () => {
    render(<FooterLink href='/contact'>Contact</FooterLink>);
    const link = screen.getByRole('link', { name: 'Contact' });
    expect(link).toHaveAttribute('href', '/contact');
  });

  it('applies external link security attributes for http URLs', () => {
    render(<FooterLink href='https://example.com'>External</FooterLink>);
    const link = screen.getByRole('link', { name: 'External' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('applies external link security attributes when external prop is true', () => {
    render(
      <FooterLink href='/internal-path' external>
        Forced External
      </FooterLink>
    );
    const link = screen.getByRole('link', { name: 'Forced External' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('does not apply external attributes for internal links', () => {
    render(<FooterLink href='/about'>Internal</FooterLink>);
    const link = screen.getByRole('link', { name: 'Internal' });
    expect(link).not.toHaveAttribute('target', '_blank');
  });

  it('applies dark tone classes by default', () => {
    render(<FooterLink href='/test'>Dark</FooterLink>);
    const link = screen.getByRole('link', { name: 'Dark' });
    expect(link).toHaveClass('text-white/70');
  });

  it('applies light tone classes', () => {
    render(
      <FooterLink href='/test' tone='light'>
        Light
      </FooterLink>
    );
    const link = screen.getByRole('link', { name: 'Light' });
    expect(link).toHaveClass('text-secondary-token');
  });

  it('applies custom className', () => {
    render(
      <FooterLink href='/test' className='my-class'>
        Styled
      </FooterLink>
    );
    const link = screen.getByRole('link', { name: 'Styled' });
    expect(link).toHaveClass('my-class');
  });

  it('renders as an anchor element', () => {
    render(<FooterLink href='/test'>Anchor</FooterLink>);
    const link = screen.getByRole('link', { name: 'Anchor' });
    expect(link.tagName).toBe('A');
  });

  it('passes a11y checks', async () => {
    const { container } = render(
      <FooterLink href='/test'>Accessible Link</FooterLink>
    );
    await expectNoA11yViolations(container);
  });
});
