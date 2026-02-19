import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistName } from '@/components/atoms/ArtistName';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

vi.mock('@/components/atoms/VerifiedBadge', () => ({
  VerifiedBadge: ({ size, className }: any) => (
    <span data-testid='verified-badge' data-size={size} className={className}>
      ✓
    </span>
  ),
}));

describe('ArtistName', () => {
  const defaultProps = { name: 'Test Artist', handle: 'testartist' };

  it('renders the artist name', () => {
    render(<ArtistName {...defaultProps} />);
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('renders as h1 by default', () => {
    render(<ArtistName {...defaultProps} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute('itemprop', 'name');
  });

  it('renders as a link by default (showLink=true)', () => {
    render(<ArtistName {...defaultProps} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/testartist');
  });

  it('does not render a link when showLink=false', () => {
    render(<ArtistName {...defaultProps} showLink={false} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders verified badge when isVerified=true', () => {
    render(<ArtistName {...defaultProps} isVerified />);
    expect(screen.getByTestId('verified-badge')).toBeInTheDocument();
  });

  it('does not render verified badge when isVerified=false', () => {
    render(<ArtistName {...defaultProps} isVerified={false} />);
    expect(screen.queryByTestId('verified-badge')).not.toBeInTheDocument();
  });

  it('renders as specified tag via the as prop', () => {
    render(<ArtistName {...defaultProps} as='span' showLink={false} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    const name = screen.getByText('Test Artist');
    // The outer tag is a span, the text is inside nested spans
    expect(name.closest('span[itemprop="name"]')).toBeInTheDocument();
  });

  it.each([
    'sm',
    'md',
    'lg',
    'xl',
  ] as const)('applies size class for size=%s', size => {
    render(<ArtistName {...defaultProps} size={size} showLink={false} />);
    const heading = screen.getByRole('heading', { level: 1 });
    // Each size should produce a valid className on the heading
    expect(heading.className).toBeTruthy();
  });

  it('applies default size class (lg)', () => {
    render(<ArtistName {...defaultProps} showLink={false} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('text-2xl');
  });

  it('applies custom className to the name span', () => {
    render(
      <ArtistName {...defaultProps} className='custom-class' showLink={false} />
    );
    expect(screen.getByText('Test Artist')).toHaveClass('custom-class');
  });

  it('passes a11y checks', async () => {
    const { container } = render(<ArtistName {...defaultProps} />);
    await expectNoA11yViolations(container);
  });
});
