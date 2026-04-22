import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ProviderStatusDot } from '@/components/features/dashboard/organisms/releases/components/ProviderStatusDot';

function renderWithTooltipProvider(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ProviderStatusDot', () => {
  it('exposes a semantic label for auto-synced links', () => {
    renderWithTooltipProvider(
      <ProviderStatusDot status='available' accent='#1db954' />
    );

    const indicator = screen.getByRole('img', {
      name: 'Auto-synced provider link',
    });
    expect(indicator).toHaveAttribute('data-provider-status', 'available');
  });

  it('exposes a semantic label for manually added links', () => {
    renderWithTooltipProvider(
      <ProviderStatusDot status='manual' accent='#f59e0b' />
    );

    const indicator = screen.getByRole('img', {
      name: 'Manually added provider link',
    });
    expect(indicator).toHaveAttribute('data-provider-status', 'manual');
  });

  it('exposes a semantic label for missing links', () => {
    renderWithTooltipProvider(
      <ProviderStatusDot status='missing' accent='#94a3b8' />
    );

    const indicator = screen.getByRole('img', {
      name: 'Missing provider link',
    });
    expect(indicator).toHaveAttribute('data-provider-status', 'missing');
  });
});
