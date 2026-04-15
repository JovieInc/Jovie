import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimBanner } from '@/features/profile/ClaimBanner';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'data-testid': testId,
    'aria-label': ariaLabel,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    'data-testid'?: string;
    'aria-label'?: string;
  }) => (
    <a
      href={href}
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  ),
}));

describe('ClaimBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the organic claim variant with the server-provided CTA', () => {
    render(
      <ClaimBanner
        profileHandle='testartist'
        ctaHref='/testartist/claim?next=auth'
        variant='organic'
      />
    );

    expect(screen.getByTestId('claim-banner')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Is this your profile? Claim it with Spotify in about a minute.'
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('claim-banner-cta')).toHaveAttribute(
      'href',
      '/testartist/claim?next=auth'
    );
  });

  it('renders the claim-intent copy for token-backed visitors', () => {
    render(
      <ClaimBanner
        profileHandle='testartist'
        ctaHref='/testartist/claim?next=auth'
        variant='claim_intent'
      />
    );

    expect(
      screen.getByText(
        'Your profile is ready. Claim it to turn on release emails.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Claim Profile')).toBeInTheDocument();
  });

  it('renders an informational banner without a CTA when direct claim is unsupported', () => {
    render(<ClaimBanner profileHandle='testartist' variant='unsupported' />);

    expect(
      screen.getByText(
        'This profile needs a claim link before it can be claimed.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId('claim-banner-cta')).not.toBeInTheDocument();
  });
});
