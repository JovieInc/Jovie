import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsActionRow } from '@/components/molecules/settings/SettingsActionRow';

describe('SettingsActionRow', () => {
  it('renders the shared settings row structure', () => {
    render(
      <SettingsActionRow
        icon={<span data-testid='row-icon'>I</span>}
        title='Billing portal'
        description='Open invoices and payment methods in Stripe.'
        action={<button type='button'>Manage</button>}
      />
    );

    expect(screen.getByTestId('row-icon')).toBeInTheDocument();
    expect(screen.getByText('Billing portal')).toBeInTheDocument();
    expect(
      screen.getByText('Open invoices and payment methods in Stripe.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument();
    expect(screen.getByTestId('row-icon').parentElement?.className).toContain(
      'rounded-full'
    );
  });

  it('owns destructive row tone for irreversible settings actions', () => {
    render(
      <SettingsActionRow
        icon={<span data-testid='row-icon'>D</span>}
        title='Delete your account'
        tone='destructive'
        description='This action cannot be undone.'
        action={<button type='button'>Delete Account</button>}
      />
    );

    const title = screen.getByText('Delete your account');
    const row = title.closest('[data-tone="destructive"]');

    expect(row).toHaveAttribute('data-state', 'idle');
    expect(title).toHaveClass('text-error');
    expect(screen.getByTestId('row-icon').parentElement).toHaveClass(
      'border-error/20',
      'bg-error-subtle',
      'text-error'
    );
    expect(screen.getByText('This action cannot be undone.')).toHaveClass(
      'text-secondary-token'
    );
  });

  it('dims disabled action rows without changing row geometry classes', () => {
    render(
      <SettingsActionRow
        disabled
        icon={<span data-testid='row-icon'>L</span>}
        title='Subscribe URL'
        description='Publish your profile to enable this setting.'
        action={
          <button type='button' disabled>
            Copy Link
          </button>
        }
      />
    );

    const title = screen.getByText('Subscribe URL');
    const row = title.closest('[data-state="disabled"]');

    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveClass(
      'flex',
      'flex-col',
      'sm:flex-row',
      'sm:justify-between'
    );
    expect(title).toHaveClass('text-(--color-text-disabled-token)');
    expect(
      screen.getByText('Publish your profile to enable this setting.')
    ).toHaveClass('text-quaternary-token');
    expect(screen.getByTestId('row-icon').parentElement).toHaveClass(
      'border-subtle',
      'bg-surface-0',
      'text-(--color-text-disabled-token)'
    );
  });
});
