import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UpgradeButton } from './UpgradeButton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: () => false,
}));

vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('UpgradeButton', () => {
  it('defaults its label to the canonical Artist Presence plan name', () => {
    render(<UpgradeButton />);

    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
  });

  it('respects explicit children over the default label', () => {
    render(<UpgradeButton>See plans</UpgradeButton>);

    expect(
      screen.getByRole('button', { name: 'See plans' })
    ).toBeInTheDocument();
  });
});
