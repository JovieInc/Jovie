import { TooltipProvider } from '@jovie/ui';
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIXTURE_NOW,
  fixtureInventory,
} from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationInventory } from '@/lib/ovie/certifications/types';
import { OvieCertificationsWorkspace } from './OvieCertificationsWorkspace';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutateAsync: vi.fn(),
  panels: [] as ReactElement[],
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/queries/useOvieCertificationsQuery', () => ({
  useOvieCertificationsQuery: mocks.query,
  useOvieCertificationDecisionMutation: () => ({
    mutateAsync: mocks.mutateAsync,
  }),
  getCertificationDecisionErrorMessage: () => 'The evidence changed.',
}));
vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: (panel: ReactElement) => {
    mocks.panels.push(panel);
  },
}));
vi.mock('@/components/feedback', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

function render(ui: ReactNode) {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

interface QueryState {
  readonly data?: OvieCertificationInventory;
  readonly isLoading?: boolean;
  readonly isError?: boolean;
  readonly isFetching?: boolean;
}

const refetch = vi.fn();

function mockQuery(state: QueryState) {
  mocks.query.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch,
    ...state,
  });
}

function latestRailProps() {
  const panel = mocks.panels.at(-1);
  if (!panel) throw new Error('no rail registered');
  return panel.props as {
    row: { id: string } | null;
    onDecide: (kind: string, notes: string | null) => Promise<void>;
    decisionError: string | null;
  };
}

describe('OvieCertificationsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.panels.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(FIXTURE_NOW));
  });

  it('renders skeleton rows and reserves count slots while loading', () => {
    mockQuery({ isLoading: true, isFetching: true });
    render(<OvieCertificationsWorkspace />);

    expect(screen.getByTestId('certification-count-all')).toHaveTextContent('');
    expect(screen.queryByText('Certifications unavailable')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Refresh Certifications' })
    ).toBeDisabled();
  });

  it('shows an explicit error state with retry when the first load fails', () => {
    mockQuery({ isError: true });
    render(<OvieCertificationsWorkspace />);

    expect(screen.getByText('Certifications unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('delegates the page title to the shell without a redundant heading', () => {
    mockQuery({ data: fixtureInventory() });
    render(<OvieCertificationsWorkspace />);

    expect(
      screen.queryByRole('heading', { name: 'Certifications' })
    ).toBeNull();
  });

  it('shows the empty state when connected domains have no items', () => {
    mockQuery({ data: { ...fixtureInventory(), rows: [] } });
    render(<OvieCertificationsWorkspace />);
    expect(screen.getByText('No certification items yet')).toBeInTheDocument();
  });

  it('renders rows with state counts, glyph evidence, and fresh data', () => {
    mockQuery({ data: fixtureInventory() });
    render(<OvieCertificationsWorkspace />);

    expect(screen.getByTestId('certification-count-all')).toHaveTextContent(
      '3'
    );
    expect(
      screen.getByTestId('certification-count-review_ready')
    ).toHaveTextContent('1');
    expect(screen.getByText('Flow signup-golden-path')).toBeInTheDocument();
    expect(screen.getAllByTestId('certification-evidence-strip')).toHaveLength(
      3
    );
    expect(screen.getByTestId('certification-freshness')).toHaveAttribute(
      'data-stale',
      'false'
    );
  });

  it('labels data stale when a background refresh fails', () => {
    mockQuery({ data: fixtureInventory(), isError: true });
    render(<OvieCertificationsWorkspace />);
    const freshness = screen.getByTestId('certification-freshness');
    expect(freshness).toHaveAttribute('data-stale', 'true');
    expect(freshness).toHaveTextContent(/^Stale/);
  });

  it('labels data stale when the inventory is old even if the fetch succeeded', () => {
    mockQuery({ data: fixtureInventory('2026-09-27T07:00:00.000Z') });
    render(<OvieCertificationsWorkspace />);
    expect(screen.getByTestId('certification-freshness')).toHaveAttribute(
      'data-stale',
      'true'
    );
  });

  it('filters by state and offers a clear-filters recovery', () => {
    mockQuery({ data: fixtureInventory() });
    render(<OvieCertificationsWorkspace />);

    const toolbar = screen.getByRole('toolbar', { name: 'Filter By State' });
    fireEvent.click(within(toolbar).getByRole('button', { name: /Certified/ }));
    expect(screen.queryByText('Flow signup-golden-path')).toBeNull();
    expect(screen.getByText('Public Profile')).toBeInTheDocument();

    fireEvent.click(within(toolbar).getByRole('button', { name: /Shipped/ }));
    expect(
      screen.getByText('No items match these filters')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(screen.getByText('Flow signup-golden-path')).toBeInTheDocument();
  });

  it('opens the rail on row select and dispatches a digest-bound decision', async () => {
    const inventory = fixtureInventory();
    mockQuery({ data: inventory });
    mocks.mutateAsync.mockResolvedValue({ row: inventory.rows[0] });
    render(<OvieCertificationsWorkspace />);

    expect(latestRailProps().row).toBeNull();
    fireEvent.click(screen.getByText('Flow signup-golden-path'));
    expect(latestRailProps().row?.id).toBe('flows:signup-golden-path');

    await act(() => latestRailProps().onDecide('approved', null));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      rowId: 'flows:signup-golden-path',
      evidenceDigest: inventory.rows[0]?.decision.evidenceDigest,
      decision: 'approved',
      notes: null,
      actionId: expect.any(String),
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Certified');
  });

  it('keeps the rail open and surfaces the server reason when a decision fails', async () => {
    mockQuery({ data: fixtureInventory() });
    mocks.mutateAsync.mockRejectedValue(new Error('409'));
    render(<OvieCertificationsWorkspace />);

    fireEvent.click(screen.getByText('Flow signup-golden-path'));
    await act(() => latestRailProps().onDecide('rejected', 'nope'));
    expect(latestRailProps().row?.id).toBe('flows:signup-golden-path');
    expect(latestRailProps().decisionError).toBe('The evidence changed.');
  });
});
