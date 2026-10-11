import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPlanGateLabel } from './SettingsPlanGateLabel';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

function renderLabel(ui: ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('SettingsPlanGateLabel', () => {
  it('defaults the gated plan label to the canonical Artist Presence name', () => {
    renderLabel(<SettingsPlanGateLabel />);

    expect(
      screen.getByRole('link', { name: 'Upgrade to Artist Presence' })
    ).toHaveAttribute('href', '/pricing');
  });

  it('respects an explicit plan name override', () => {
    renderLabel(<SettingsPlanGateLabel planName='Artist Presence Max' />);

    expect(
      screen.getByRole('link', { name: 'Upgrade to Artist Presence Max' })
    ).toBeInTheDocument();
  });
});
