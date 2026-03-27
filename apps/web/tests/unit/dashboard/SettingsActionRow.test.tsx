import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsActionRow } from '@/components/features/dashboard/molecules/SettingsActionRow';

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
  });
});
