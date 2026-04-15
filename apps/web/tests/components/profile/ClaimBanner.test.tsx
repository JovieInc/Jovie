import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimBanner } from '@/features/profile/ClaimBanner';

const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  track: trackMock,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'data-testid': testId,
    'aria-label': ariaLabel,
    onClick,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    'data-testid'?: string;
    'aria-label'?: string;
    onClick?: () => void;
  }) => (
    <a
      href={href}
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
      onClick={event => {
        event.preventDefault();
        onClick?.();
      }}
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

  it('tracks impressions for each distinct variant', () => {
    const { rerender } = render(
      <ClaimBanner profileHandle='testartist' variant='organic' />
    );

    rerender(<ClaimBanner profileHandle='testartist' variant='organic' />);
    rerender(
      <ClaimBanner profileHandle='testartist' variant='direct_in_progress' />
    );

    expect(trackMock).toHaveBeenCalledTimes(2);
    expect(trackMock).toHaveBeenNthCalledWith(
      1,
      'profile_claim_banner_impression',
      {
        profile_handle: 'testartist',
        variant: 'organic',
      }
    );
    expect(trackMock).toHaveBeenNthCalledWith(
      2,
      'profile_claim_banner_impression',
      {
        profile_handle: 'testartist',
        variant: 'direct_in_progress',
      }
    );
  });

  it('redacts tokenized claim URLs in click analytics', () => {
    render(
      <ClaimBanner
        profileHandle='testartist'
        ctaHref='/claim/sensitive-token'
        variant='claim_intent'
      />
    );

    fireEvent.click(screen.getByTestId('claim-banner-cta'));

    expect(trackMock).toHaveBeenCalledWith('profile_claim_banner_click', {
      profile_handle: 'testartist',
      destination: '/claim/[token]',
      variant: 'claim_intent',
    });
  });
});
