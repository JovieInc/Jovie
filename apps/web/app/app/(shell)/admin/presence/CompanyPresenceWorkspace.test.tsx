import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  buildCompanyPresencePages,
  COMPANY_PRESENCE_SOURCES,
} from '@/lib/ovie/company-presence/inventory';
import type {
  CompanyPresenceData,
  CompanyPresencePage,
} from '@/lib/ovie/company-presence/model';
import { CompanyPresenceWorkspace } from './CompanyPresenceWorkspace';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/app/ov/presence',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

const unconfiguredData: CompanyPresenceData = {
  pages: buildCompanyPresencePages({
    ownedProfiles: [{ username: 'tim', displayName: 'Tim White' }],
  }),
  sources: COMPANY_PRESENCE_SOURCES,
  profilesUnavailable: false,
};

const measuredPage: CompanyPresencePage = {
  id: 'marketing:/pricing',
  path: '/pricing',
  label: 'Pricing',
  kind: 'marketing',
  checks: {
    indexed: {
      state: 'measured',
      outcome: 'pass',
      summary: 'Indexed',
      checkedAt: new Date().toISOString(),
    },
    seo_certification: { state: 'unconfigured', reason: 'Not wired.' },
    copy_gate: { state: 'unconfigured', reason: 'Not wired.' },
    lighthouse: {
      state: 'measured',
      outcome: 'fail',
      summary: '41',
      checkedAt: new Date().toISOString(),
    },
  },
};

function renderWorkspace(data: CompanyPresenceData) {
  return render(
    <HeaderActionsProvider>
      <TooltipProvider>
        <CompanyPresenceWorkspace
          scope={{
            actorId: 'test-actor',
            workspaceId: 'test-workspace',
            target: 'company',
          }}
          data={data}
        />
      </TooltipProvider>
    </HeaderActionsProvider>
  );
}

function lastPanel() {
  return vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
}

describe('CompanyPresenceWorkspace', () => {
  afterEach(() => {
    vi.mocked(useRegisterRightPanel).mockReset();
  });

  it('shows every unwired check as Unconfigured instead of a zero', () => {
    renderWorkspace(unconfiguredData);

    expect(
      screen.getByTestId('company-presence-workspace')
    ).toBeInTheDocument();
    const pricingRow = screen.getByText('/pricing').closest('tr');
    expect(pricingRow).not.toBeNull();
    const row = within(pricingRow as HTMLElement);
    expect(
      row.getAllByTestId('company-presence-check-unconfigured')
    ).toHaveLength(4);
    expect(row.queryByTestId('company-presence-check-measured')).toBeNull();
    expect(
      row.getAllByText('Unconfigured', { selector: 'span.min-w-0' }).length
    ).toBeGreaterThan(0);
    expect(pricingRow?.textContent).not.toMatch(/\b0\b/);
  });

  it('states how many sources are connected', () => {
    renderWorkspace(unconfiguredData);
    expect(
      screen.getByTestId('company-presence-source-count')
    ).toHaveTextContent('0 of 4 Sources Connected');
  });

  it('renders measured checks with their summary and failing status first', () => {
    renderWorkspace({
      ...unconfiguredData,
      pages: unconfiguredData.pages.map(page =>
        page.path === measuredPage.path ? measuredPage : page
      ),
    });

    const bodyRows = screen.getAllByRole('row').slice(1);
    const firstBodyRow = within(bodyRows[0] as HTMLElement);
    expect(firstBodyRow.getByText('/pricing')).toBeInTheDocument();
    expect(firstBodyRow.getByText('41 · fail')).toBeInTheDocument();
    expect(firstBodyRow.getByText('Indexed · pass')).toBeInTheDocument();
    expect(firstBodyRow.getAllByText('Needs Review').length).toBeGreaterThan(0);
  });

  it('filters to profiles and shows owned profiles only', () => {
    renderWorkspace(unconfiguredData);
    fireEvent.click(screen.getByRole('button', { name: 'Profiles' }));
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.queryByText('/pricing')).toBeNull();
  });

  it('shows an explicit empty state when no owned profiles exist', () => {
    renderWorkspace({
      ...unconfiguredData,
      pages: buildCompanyPresencePages({ ownedProfiles: [] }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Profiles' }));
    expect(screen.getByText('No Pages in This Category')).toBeInTheDocument();
  });

  it('distinguishes a failed profile lookup from an empty list', () => {
    renderWorkspace({
      ...unconfiguredData,
      pages: buildCompanyPresencePages({ ownedProfiles: [] }),
      profilesUnavailable: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Profiles' }));
    expect(screen.getByText('Profiles Unavailable')).toBeInTheDocument();
  });

  it('opens the right rail with checks and signals for the selected page', () => {
    renderWorkspace(unconfiguredData);
    expect(lastPanel()).toBeNull();

    fireEvent.click(screen.getByText('/pricing'));
    const panel = lastPanel();
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByTestId('company-presence-rail-header')
    ).toHaveTextContent('Marketing · /pricing');
    expect(screen.getByTestId('presence-signal-list')).toHaveTextContent(
      'Indexed: Unconfigured'
    );
  });
});
