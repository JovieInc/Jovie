import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CompactReleasePlanUpgradeCard,
  ReleasePlanUpgradeInterstitial,
} from './TasksUpgradeInterstitial';

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

describe('TasksUpgradeInterstitial', () => {
  it('names the canonical Artist Presence plan on the compact upgrade CTA', () => {
    render(<CompactReleasePlanUpgradeCard onDismiss={() => {}} />);

    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Maybe Later' })
    ).toBeInTheDocument();
  });

  it('binds the release title into the release-plan upsell copy', () => {
    render(<ReleasePlanUpgradeInterstitial releaseTitle='Skyline Dreams' />);

    expect(
      screen.getByText(/Skyline Dreams into a step-by-step plan/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
  });
});
