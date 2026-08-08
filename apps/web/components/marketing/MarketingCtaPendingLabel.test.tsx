import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingCtaPendingLabel } from './MarketingCtaPendingLabel';

const { useLinkStatus } = vi.hoisted(() => ({
  useLinkStatus: vi.fn(() => ({ pending: false })),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { readonly children: ReactNode }) => children,
  useLinkStatus,
}));

describe('MarketingCtaPendingLabel', () => {
  beforeEach(() => {
    useLinkStatus.mockReturnValue({ pending: false });
  });

  it('keeps the label visible and spinner hidden while idle', () => {
    render(<MarketingCtaPendingLabel>Get started</MarketingCtaPendingLabel>);

    expect(screen.getByText('Get started')).toHaveClass('opacity-100');
    expect(screen.getByTestId('spinner').parentElement).toHaveClass(
      'opacity-0'
    );
  });

  it('swaps opacity without changing the CTA footprint while pending', () => {
    useLinkStatus.mockReturnValue({ pending: true });

    render(<MarketingCtaPendingLabel>Get started</MarketingCtaPendingLabel>);

    expect(screen.getByText('Get started')).toHaveClass('opacity-0');
    const pendingLayer = screen.getByTestId('spinner').parentElement;
    expect(pendingLayer).toHaveClass('absolute', 'inset-0', 'opacity-100');
    expect(pendingLayer).toHaveAttribute('aria-hidden', 'true');
  });
});
