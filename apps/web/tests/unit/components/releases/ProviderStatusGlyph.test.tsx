import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ProviderStatusGlyph } from '@/components/features/dashboard/organisms/releases/components/ProviderStatusGlyph';

function renderWithTooltipProvider(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ProviderStatusGlyph', () => {
  it('exposes a semantic label for auto-synced links', () => {
    renderWithTooltipProvider(<ProviderStatusGlyph status='available' />);

    const indicator = screen.getByRole('img', {
      name: 'Auto-synced provider link',
    });
    expect(indicator).toHaveAttribute('data-provider-status', 'available');
  });

  it('exposes a semantic label for manually added links', () => {
    renderWithTooltipProvider(<ProviderStatusGlyph status='manual' />);

    const indicator = screen.getByRole('img', {
      name: 'Manually added provider link',
    });
    expect(indicator).toHaveAttribute('data-provider-status', 'manual');
  });

  it('exposes a semantic label for missing links', () => {
    renderWithTooltipProvider(<ProviderStatusGlyph status='missing' />);

    const indicator = screen.getByRole('img', {
      name: 'Missing provider link',
    });
    expect(indicator).toHaveAttribute('data-provider-status', 'missing');
  });
});
