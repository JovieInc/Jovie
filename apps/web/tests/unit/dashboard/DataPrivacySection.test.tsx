import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { DataPrivacySection } from '@/components/features/dashboard/organisms/DataPrivacySection';

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('DataPrivacySection', () => {
  it('owns destructive settings-row tone for account deletion', () => {
    renderWithQueryClient(<DataPrivacySection />);

    const title = screen.getByText('Delete your account');
    const row = title.closest('[data-tone="destructive"]');

    expect(row).toHaveAttribute('data-state', 'idle');
    expect(title).toHaveClass('text-error');
    expect(
      screen.getByText(
        'Permanently remove your account, profile, contacts, and all associated data. This action cannot be undone.'
      )
    ).toHaveClass('text-secondary-token');
    expect(
      screen.getByRole('button', { name: 'Delete Account' })
    ).toBeEnabled();
  });
});
