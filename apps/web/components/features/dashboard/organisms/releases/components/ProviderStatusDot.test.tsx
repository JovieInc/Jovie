import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProviderStatusDot } from './ProviderStatusDot';

function renderDot(status: 'available' | 'manual' | 'missing') {
  return render(
    <TooltipProvider delayDuration={0}>
      <ProviderStatusDot status={status} accent='#1DB954' />
    </TooltipProvider>
  );
}

describe('ProviderStatusDot certificate', () => {
  it.each([
    ['available', 'Auto-synced provider link'],
    ['manual', 'Manually added provider link'],
    ['missing', 'Missing provider link'],
  ] as const)(
    'names the %s state without relying on color',
    async (status, label) => {
      const { container } = renderDot(status);

      const dot = screen.getByRole('img', { name: label });
      expect(dot).toHaveAttribute('data-provider-status', status);
      expect(dot).toHaveTextContent(label);
      expect(dot.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      await expectNoA11yViolations(container);
    }
  );

  it('paints only the auto-synced dot with the provider accent', () => {
    renderDot('available');
    expect(
      screen.getByRole('img', { name: 'Auto-synced provider link' })
    ).toHaveStyle({ color: '#1DB954' });
  });

  it.each(['manual', 'missing'] as const)(
    'leaves the %s dot on design tokens',
    status => {
      renderDot(status);
      expect(screen.getByRole('img').getAttribute('style')).toBeNull();
    }
  );

  it('shows the label in a tooltip on hover', async () => {
    const user = userEvent.setup();
    renderDot('manual');

    await user.hover(
      screen.getByRole('img', { name: 'Manually added provider link' })
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Manually added provider link'
    );
  });
});
