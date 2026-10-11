import { TooltipProvider } from '@jovie/ui';
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from '@testing-library/react';
import * as navigation from 'next/navigation';
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
  useRef,
} from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
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
  useRegisterRightPanel: vi.fn(),
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
    onDecide: (kind: string, notes: string | null) => Promise<boolean | void>;
    onWalkthrough?: () => void;
    decisionError: string | null;
  };
}

describe('OvieCertificationsWorkspace', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.spyOn(navigation, 'useSearchParams').mockImplementation(
      () =>
        new URLSearchParams(
          typeof window === 'undefined' ? '' : window.location.search
        ) as ReturnType<typeof navigation.useSearchParams>
    );
    vi.clearAllMocks();
    vi.mocked(useRegisterRightPanel).mockImplementation(panel => {
      if (isValidElement(panel)) mocks.panels.push(panel);
    });
    mocks.panels.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(FIXTURE_NOW));
  });

  it('keeps the live detail rail stable when its host renders the registered panel', async () => {
    const actual = await vi.importActual<
      typeof import('@/hooks/useRegisterRightPanel')
    >('@/hooks/useRegisterRightPanel');
    vi.mocked(useRegisterRightPanel).mockImplementation(
      actual.useRegisterRightPanel
    );
    mockQuery({ data: fixtureInventory() });

    function WorkspaceAndRail() {
      const panel = useRightPanel();
      const renders = useRef(0);
      if (++renders.current > 20) {
        throw new Error('Detail rail registration entered a render loop');
      }
      return (
        <>
          <OvieCertificationsWorkspace />
          {panel}
        </>
      );
    }

    render(
      <RightPanelProvider>
        <WorkspaceAndRail />
      </RightPanelProvider>
    );
    expect(screen.getByTestId('certification-detail-rail')).toHaveTextContent(
      'Select a certification to review its evidence.'
    );
    fireEvent.click(screen.getByText('Flow signup-golden-path'));
    expect(screen.getByTestId('certification-detail-rail')).toHaveTextContent(
      'Flow signup-golden-path'
    );
    expect(
      within(screen.getByTestId('certification-detail-rail')).getByRole(
        'button',
        { name: 'Certify' }
      )
    ).toBeEnabled();
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

  it('keeps the registered rail stable across host re-renders', () => {
    // The mutation hook returns a fresh object every render, like useMutation.
    // A rail that changed identity per render made a panel-consuming host
    // re-render forever (Maximum update depth in the Storybook a11y lane).
    mockQuery({ data: fixtureInventory() });
    const { rerender } = render(<OvieCertificationsWorkspace />);
    const first = mocks.panels.at(-1);
    rerender(
      <TooltipProvider>
        <OvieCertificationsWorkspace />
      </TooltipProvider>
    );
    expect(mocks.panels.at(-1)).toBe(first);
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

  it('deep-links to the evidence rail when ?row= is present', () => {
    const inventory = fixtureInventory();
    mockQuery({ data: inventory });
    window.history.pushState({}, '', '?row=flows%3Asignup-golden-path');
    try {
      const { rerender } = render(<OvieCertificationsWorkspace />);
      expect(latestRailProps().row?.id).toBe('flows:signup-golden-path');
      window.history.pushState(
        {},
        '',
        `?row=${encodeURIComponent(inventory.rows[1]!.id)}`
      );
      rerender(
        <TooltipProvider>
          <OvieCertificationsWorkspace />
        </TooltipProvider>
      );
      expect(latestRailProps().row?.id).toBe(inventory.rows[1]?.id);
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('hydrates a row deep link without changing the server-rendered selection', async () => {
    mockQuery({ data: fixtureInventory() });
    window.history.pushState({}, '', '?row=flows%3Asignup-golden-path');
    const browserWindow = window;
    const container = document.createElement('div');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverable = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      vi.stubGlobal('window', undefined);
      const html = renderToString(
        <TooltipProvider>
          <OvieCertificationsWorkspace />
        </TooltipProvider>
      );
      vi.stubGlobal('window', browserWindow);
      container.innerHTML = html;
      document.body.append(container);
      await act(async () => {
        root = hydrateRoot(
          container,
          <TooltipProvider>
            <OvieCertificationsWorkspace />
          </TooltipProvider>,
          { onRecoverableError: recoverable }
        );
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors.mock.calls.flat().join(' ')).not.toMatch(
        /hydration|hydrated|didn't match/i
      );
      expect(latestRailProps().row?.id).toBe('flows:signup-golden-path');
    } finally {
      vi.unstubAllGlobals();
      await act(async () => root?.unmount());
      container.remove();
      errors.mockRestore();
      window.history.pushState({}, '', '/');
    }
  });

  it('opens the walkthrough from the rail and certifies through the same digest-bound path', async () => {
    const inventory = fixtureInventory();
    mockQuery({ data: inventory });
    mocks.mutateAsync.mockResolvedValue({ row: inventory.rows[0] });
    render(<OvieCertificationsWorkspace />);

    fireEvent.click(screen.getByText('Flow signup-golden-path'));
    act(() => latestRailProps().onWalkthrough?.());

    expect(screen.getByTestId('certification-walkthrough')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Certify' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Certify' }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    fireEvent.load(screen.getByTestId('walkthrough-image'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Certify' }));
    });
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      rowId: 'flows:signup-golden-path',
      evidenceDigest: inventory.rows[0]?.decision.evidenceDigest,
      decision: 'approved',
      notes: null,
      actionId: expect.any(String),
    });
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

describe('certification inventory recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['domain', 'refresh'] as const)(
    'does not claim there are no items after a %s failure',
    failure => {
      const inventory = fixtureInventory();
      mocks.query.mockReturnValue({
        data: {
          ...inventory,
          rows: [],
          domains:
            failure === 'domain'
              ? inventory.domains.map(domain => ({
                  ...domain,
                  status: 'error',
                }))
              : inventory.domains,
          issues: [],
        },
        isLoading: false,
        isFetching: false,
        isError: failure === 'refresh',
        refetch,
      });
      render(
        <TooltipProvider>
          <OvieCertificationsWorkspace />
        </TooltipProvider>
      );
      expect(screen.queryByText('No certification items yet')).toBeNull();
      expect(
        screen.getByText('Certifications unavailable')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps available rows usable when another source fails', () => {
    mocks.query.mockReturnValue({
      data: {
        ...fixtureInventory(),
        issues: [
          {
            domain: null,
            source: 'ovie_operating_kv',
            message: 'Inventory read failed.',
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch,
    });
    render(
      <TooltipProvider>
        <OvieCertificationsWorkspace />
      </TooltipProvider>
    );
    expect(screen.getByText('Flow signup-golden-path')).toBeInTheDocument();
    expect(screen.queryByText('Certifications unavailable')).toBeNull();
  });
});
