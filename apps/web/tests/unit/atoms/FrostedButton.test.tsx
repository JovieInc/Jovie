import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FrostedButton } from '@/components/atoms/FrostedButton';
import { expectNoA11yViolations } from '../../utils/a11y';

vi.mock('@jovie/ui', () => ({
  Button: ({ children, className, variant, asChild, ...props }: any) => (
    <button className={className} data-variant={variant} {...props}>
      {children}
    </button>
  ),
  // Canonical Link primitive: passthrough so the Slot chain renders the
  // Next.js anchor child in these unit tests.
  Link: ({ children }: any) => <>{children}</>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('FrostedButton', () => {
  it('renders as a button when no href prop', () => {
    render(<FrostedButton>Click</FrostedButton>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it('renders as a link when href is provided', () => {
    render(<FrostedButton href='/page'>Link</FrostedButton>);
    const link = screen.getByRole('link', { name: 'Link' });
    expect(link).toHaveAttribute('href', '/page');
  });

  it('applies solid tone by default (maps to secondary variant)', () => {
    render(<FrostedButton>Solid</FrostedButton>);
    const button = screen.getByRole('button', { name: 'Solid' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
  });

  it('applies ghost tone (maps to ghost variant)', () => {
    render(<FrostedButton tone='ghost'>Ghost</FrostedButton>);
    const button = screen.getByRole('button', { name: 'Ghost' });
    expect(button).toHaveAttribute('data-variant', 'ghost');
  });

  it('applies outline tone (maps to secondary variant)', () => {
    render(<FrostedButton tone='outline'>Outline</FrostedButton>);
    const button = screen.getByRole('button', { name: 'Outline' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
  });

  it('adds target="_blank" and rel="noopener noreferrer" when external=true', () => {
    render(
      <FrostedButton href='/ext' external>
        External
      </FrostedButton>
    );
    const link = screen.getByRole('link', { name: 'External' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders children', () => {
    render(<FrostedButton>Child text</FrostedButton>);
    expect(screen.getByText('Child text')).toBeInTheDocument();
  });

  it('passes through disabled prop', () => {
    render(<FrostedButton disabled>Disabled</FrostedButton>);
    const button = screen.getByRole('button', { name: 'Disabled' });
    expect(button).toBeDisabled();
  });

  it('keeps shared hover feedback free of decorative transforms', () => {
    render(<FrostedButton>Motion safe</FrostedButton>);
    const button = screen.getByRole('button', { name: 'Motion safe' });
    expect(button.className).not.toMatch(
      /\b(?:transition-all|duration-\d+|hover:scale|hover:translate|hover:-translate|group-hover:scale|group-hover:translate|group-hover:-translate)\b/
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<FrostedButton>Accessible</FrostedButton>);
    await expectNoA11yViolations(container);
  });
});
