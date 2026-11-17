import { TooltipProvider } from '@jovie/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as navigation from 'next/navigation';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIXTURE_NOW,
  fixtureInventory,
} from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationInventory } from '@/lib/ovie/certifications/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OvieCertificationsWorkspace } from './OvieCertificationsWorkspace';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/lib/queries/useOvieCertificationsQuery', () => ({
  useOvieCertificationsQuery: mocks.query,
  useOvieCertificationDecisionMutation: () => ({ mutateAsync: vi.fn() }),
  getCertificationDecisionErrorMessage: () => 'The evidence changed.',
}));
vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));
vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderWorkspace(ui: ReactNode = <OvieCertificationsWorkspace />) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

function mockQuery(state: {
  readonly data?: OvieCertificationInventory;
  readonly isLoading?: boolean;
  readonly isError?: boolean;
}) {
  mocks.query.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: mocks.refetch,
    ...state,
  });
}

describe('OvieCertificationsWorkspace certificate', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.spyOn(navigation, 'useSearchParams').mockReturnValue(
      new URLSearchParams('') as ReturnType<typeof navigation.useSearchParams>
    );
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(FIXTURE_NOW));
  });

  it('keeps the loading table axe-clean', async () => {
    mockQuery({ isLoading: true });
    const { container } = renderWorkspace();
    expect(screen.getByTestId('ovie-certifications-page')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('retries a failed first load from the error state', async () => {
    const user = userEvent.setup();
    mockQuery({ isError: true });
    const { container } = renderWorkspace();
    expect(screen.getByText('Certifications unavailable')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty inventory axe-clean', async () => {
    mockQuery({ data: { ...fixtureInventory(), rows: [] } });
    const { container } = renderWorkspace();
    expect(screen.getByText('No certification items yet')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('marks a failed background refresh stale and refreshes on demand', async () => {
    const user = userEvent.setup();
    mockQuery({ data: fixtureInventory(), isError: true });
    const { container } = renderWorkspace();
    expect(screen.getByTestId('certification-freshness')).toHaveAttribute(
      'data-stale',
      'true'
    );
    expect(screen.getByText('Flow signup-golden-path')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Refresh Certifications' })
    );
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('filters by state from the toolbar and recovers with Clear Filters', async () => {
    const user = userEvent.setup();
    mockQuery({ data: fixtureInventory() });
    const { container } = renderWorkspace();
    const toolbar = screen.getByRole('toolbar', { name: 'Filter By State' });
    const monitored = within(toolbar)
      .getAllByRole('button')
      .find(button => button.textContent?.startsWith('Monitored'));
    expect(monitored).toBeDefined();
    await user.click(monitored!);
    expect(
      screen.queryByText('Flow signup-golden-path')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('No items match these filters')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(screen.getByText('Flow signup-golden-path')).toBeInTheDocument();
  });

  it('keeps long titles in an RTL document axe-clean', async () => {
    const inventory = fixtureInventory();
    const title =
      'Flow signup golden path through claim, onboarding chat, verification and the first paid plan';
    mockQuery({
      data: {
        ...inventory,
        rows: inventory.rows.map(row => ({
          ...row,
          subject: { ...row.subject, title },
        })),
      },
    });
    const { container } = renderWorkspace(
      <div dir='rtl'>
        <OvieCertificationsWorkspace />
      </div>
    );
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
