import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/dashboard/organisms/SettingsUsageStatsSection', () => ({
  SettingsUsageStatsSection: () => <div data-testid='usage-stats-section' />,
}));

describe('settings usage page', () => {
  it('renders the usage stats settings surface', async () => {
    const { default: SettingsUsagePage } = await import(
      '../../../app/app/(shell)/settings/usage/page'
    );

    render(<SettingsUsagePage />);

    expect(
      screen.getByRole('heading', { name: 'Usage Stats' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('usage-stats-section')).toBeInTheDocument();
  });
});
