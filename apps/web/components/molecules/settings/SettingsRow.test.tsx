import { Button, Switch, TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsRow, settingsRowIds } from './SettingsRow';

const checkout = await vi.hoisted(async () => {
  const { createUpgradeCheckoutFixture } = await import(
    '@/tests/fixtures/upgrade-checkout'
  );
  return createUpgradeCheckoutFixture();
});
vi.mock('@/lib/analytics', () => ({
  track: checkout.track,
  useFeatureFlag: () => true,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: checkout.push }),
}));
vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => ({
    mutate: checkout.mutate,
    reset: checkout.reset,
    isPending: false,
    error: null,
  }),
  usePricingOptionsQuery: () => checkout.pricing,
}));
beforeEach(() => vi.clearAllMocks());

describe('SettingsRow', () => {
  it('renders a 14px title, one truncated muted line and the control', async () => {
    const end = vi.fn();
    const { container } = render(
      <SettingsRow
        title='Interface theme'
        description='Select or customize your interface color scheme'
        control={
          <Button type='button' size='sm' onClick={end}>
            Change
          </Button>
        }
      />
    );

    expect(screen.getByText('Interface theme')).toHaveClass(
      'text-sm',
      'font-medium',
      'text-primary-token'
    );
    expect(
      screen.getByText('Select or customize your interface color scheme')
    ).toHaveClass('truncate', 'text-xs', 'text-secondary-token');

    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(end).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('omits the description line when none is given', () => {
    const { container } = render(
      <SettingsRow title='Email' control={<span>ada@example.com</span>} />
    );
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('gives a switch its accessible name and description from the row', async () => {
    const change = vi.fn();
    const ids = settingsRowIds('contrast');
    const { container } = render(
      <SettingsRow
        id='contrast'
        title='High contrast'
        description='Increase contrast for text, borders, and surfaces.'
        control={
          <Switch
            checked={false}
            onCheckedChange={change}
            aria-labelledby={ids.titleId}
            aria-describedby={ids.descriptionId}
          />
        }
      />
    );

    const control = screen.getByRole('switch', { name: 'High contrast' });
    expect(control).toHaveAccessibleDescription(
      'Increase contrast for text, borders, and surfaces.'
    );
    await userEvent.click(control);
    expect(change).toHaveBeenCalledWith(true);
    await expectNoA11yViolations(container);
  });

  it('marks destructive and disabled rows with their own title tone', async () => {
    const { container, rerender } = render(
      <SettingsRow
        title='Delete account'
        tone='destructive'
        control={<span>x</span>}
      />
    );
    expect(screen.getByText('Delete account')).toHaveClass('text-error-text');

    rerender(
      <SettingsRow
        title='Delete account'
        description='This cannot be undone.'
        tone='destructive'
        disabled
        control={<span>x</span>}
      />
    );
    const row = container.querySelector('[data-settings-row]');
    expect(row).toHaveAttribute('data-state', 'disabled');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Delete account')).toHaveClass(
      'text-(--color-text-disabled-token)'
    );
    expect(screen.getByText('This cannot be undone.')).toHaveClass(
      'text-quaternary-token'
    );
    await expectNoA11yViolations(container);
  });

  it('swaps the control for the plan upgrade label when gated', async () => {
    const { container } = render(
      <TooltipProvider>
        <SettingsRow
          title='Double opt-in verification'
          description='New fans confirm their email first.'
          gated={{ planName: 'Max' }}
          control={<span>hidden control</span>}
        />
      </TooltipProvider>
    );

    expect(screen.queryByText('hidden control')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Upgrade to Max' })
    ).toHaveAttribute('href', '/pricing');
    expect(container.querySelector('[data-settings-row]')).toHaveAttribute(
      'data-state',
      'gated'
    );
    await expectNoA11yViolations(container);
  });

  it('renders an optional full-width body under the row', () => {
    render(
      <SettingsRow title='Rider' control={<span>Edit</span>}>
        <p>Inline editor</p>
      </SettingsRow>
    );
    expect(screen.getByText('Inline editor').parentElement).toHaveClass(
      'px-4',
      'pb-3.5'
    );
  });
});
