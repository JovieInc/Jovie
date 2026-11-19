import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminProfileSidebar } from './AdminProfileSidebar';
import {
  partialEnrichment,
  sidebarContact,
  sidebarProfile,
} from './adminProfileSidebar.test-fixtures';

function renderRail(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe('AdminProfileSidebar certificate', () => {
  it('shows the identity enrichment label in sentence case, not forced caps', async () => {
    const { container } = renderRail(
      <AdminProfileSidebar
        profile={{ ...sidebarProfile, isClaimed: false }}
        contact={sidebarContact}
        isOpen
        onClose={vi.fn()}
      />
    );

    const panel = screen.getByTestId('identity-enrichment-panel');
    const label = within(panel).getByText('Identity enrichment');
    expect(label).not.toHaveClass('uppercase');
    expect(within(panel).getAllByText('Not checked')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('lists a partial enrichment with its verified source and conflict', async () => {
    const { container } = renderRail(
      <AdminProfileSidebar
        profile={{
          ...sidebarProfile,
          isClaimed: false,
          identityEnrichment: partialEnrichment,
        }}
        contact={sidebarContact}
        isOpen
        onClose={vi.fn()}
      />
    );

    const panel = screen.getByTestId('identity-enrichment-panel');
    expect(within(panel).getByText('Partially enriched')).toBeInTheDocument();
    expect(within(panel).getByText('Verified')).toBeInTheDocument();
    expect(within(panel).getByText('Not found')).toBeInTheDocument();
    expect(within(panel).getByText('Conflicted (2)')).toBeInTheDocument();
    expect(
      within(panel).getByText('Not ready — low evidence')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('switches tabs and hides the enrichment panel off the social tab', async () => {
    const user = userEvent.setup();
    const { container } = renderRail(
      <AdminProfileSidebar
        profile={{ ...sidebarProfile, isClaimed: false }}
        contact={sidebarContact}
        isOpen
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'About' }));
    expect(screen.getByRole('tab', { name: 'About' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByTestId('identity-enrichment-panel')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the empty rail without a profile', async () => {
    const { container } = renderRail(
      <AdminProfileSidebar
        profile={null}
        contact={null}
        isOpen
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText('Select a creator profile to view details.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
