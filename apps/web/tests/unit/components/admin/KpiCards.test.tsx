import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiCards } from '@/components/admin/KpiCards';

describe('KpiCards', () => {
  it('renders only the four essential admin metrics', () => {
    render(
      <KpiCards
        mrrUsd={12500}
        balanceUsd={87000}
        burnRateUsd={9300}
        claimedCreators={312}
        stripeAvailability={{ isConfigured: true, isAvailable: true }}
        mercuryAvailability={{ isConfigured: true, isAvailable: true }}
      />
    );

    expect(screen.getByText('MRR')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Burn rate')).toBeInTheDocument();
    expect(screen.getByText('Claimed creators')).toBeInTheDocument();

    expect(screen.queryByText('Runway')).not.toBeInTheDocument();
    expect(screen.queryByText('Waitlist')).not.toBeInTheDocument();
    expect(screen.queryByText('Active subs')).not.toBeInTheDocument();
  });
});
