import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShippingMatrix } from '@/app/app/(shell)/admin/shipping/ShippingMatrix';
import {
  parseShippingCockpitProjection,
  type ShippingCockpitProjection,
} from '@/lib/ovie/shipping-state/client';
import { unknownProjection } from '@/lib/ovie/shipping-state/project';

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({
    children,
    surface: _surface,
    ...props
  }: ComponentProps<'section'> & { surface: string }) => (
    <section {...props}>{children}</section>
  ),
}));

vi.mock('@/app/app/(shell)/admin/ops/HudStatusPill', () => ({
  HudStatusPill: ({ label, tone }: { label: string; tone: string }) => (
    <span data-tone={tone}>{label}</span>
  ),
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerPropertyRow: ({
    label,
    value,
  }: {
    label: string;
    value: ReactNode;
  }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  DrawerSection: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <section>
      <h3>{title}</h3>
      {children}
    </section>
  ),
  EntityHeader: ({
    badge,
    subtitle,
    thumbnail,
    title,
  }: {
    badge?: ReactNode;
    subtitle: string;
    thumbnail: ReactNode;
    title: string;
  }) => (
    <header>
      {thumbnail}
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {badge}
    </header>
  ),
  EntityHeaderThumbnail: ({
    icon,
    name,
  }: {
    icon: ReactNode;
    name: string;
  }) => (
    <span role='img' aria-label={name}>
      {icon}
    </span>
  ),
  EntitySidebarShell: ({
    ariaLabel,
    children,
    entityHeader,
    isOpen,
    onClose,
  }: {
    ariaLabel: string;
    children: ReactNode;
    entityHeader?: ReactNode;
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <aside aria-label={ariaLabel}>
        {entityHeader}
        {children}
        <button type='button' onClick={onClose}>
          Close details
        </button>
      </aside>
    ) : null,
}));

type MatrixFeed = ShippingCockpitProjection['operationalTasks'];
type MatrixTask = MatrixFeed['tasks'][number];
type PullRequest = NonNullable<MatrixTask['pullRequest']>;

const SHA = 'ee7401f37e0b324e225751f0d97ce229838ac8b4';

function pullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 101,
    url: 'https://github.com/JovieInc/Jovie/pull/101',
    branch: 'devin/jov-1-matrix',
    agent: 'devin',
    isDraft: false,
    checks: { rollup: 'failure', failing: ['PR Ready', 'biome', 'typecheck'] },
    queuePosition: null,
    queueState: null,
    createdAt: '2026-09-26T00:00:00.000Z',
    ...overrides,
  };
}

function task(number: number, overrides: Partial<MatrixTask> = {}): MatrixTask {
  return {
    id: `linear:JOV-${number}`,
    linearIdentifier: `JOV-${number}`,
    linearUrl: `https://linear.app/jovie/issue/jov-${number}`,
    title: `Matrix task ${number}`,
    workflowState: 'in-review',
    priority: 'none',
    attempt: null,
    retryAt: null,
    sourceRevision: SHA,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function projection(
  tasks: MatrixTask[],
  overrides: Partial<MatrixFeed> = {}
): ShippingCockpitProjection {
  const timestamp = new Date().toISOString();
  const base = unknownProjection({
    sequence: 1,
    observationTimestamp: timestamp,
    emissionTimestamp: timestamp,
    latencyMs: 10,
    publishing: true,
    lastError: null,
  });
  const candidate = {
    ...base,
    operationalTasks: {
      ...base.operationalTasks,
      syncState: 'fresh',
      tasks,
      ...overrides,
    },
  };
  const parsed = parseShippingCockpitProjection(candidate);
  if (!parsed) throw new Error('invalid shipping matrix fixture');
  return parsed;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function renderMatrix() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ShippingMatrix />
    </QueryClientProvider>
  );
}

describe('ShippingMatrix rendering (JOV-6893)', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders live status variants and opens evidence details', async () => {
    const oldTimestamp = new Date(Date.now() - 48 * 60 * 60_000).toISOString();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        projection([
          task(1, { title: 'Failing release', pullRequest: pullRequest() }),
          task(2, {
            title: 'Queued release',
            workflowState: 'merge-queued',
            pullRequest: pullRequest({
              number: 102,
              checks: { rollup: 'success', failing: [] },
              queuePosition: 2,
              queueState: 'AWAITING_CHECKS',
            }),
          }),
          task(3, {
            title: 'Pending release',
            workflowState: 'queued',
            pullRequest: pullRequest({
              number: 103,
              checks: { rollup: 'pending', failing: [] },
            }),
          }),
          task(4, {
            title: 'Merged release',
            workflowState: 'merged',
            pullRequest: pullRequest({
              number: 104,
              checks: { rollup: 'unknown', failing: [] },
            }),
          }),
          task(5, {
            title: 'Stalled retry',
            workflowState: 'retrying',
            updatedAt: oldTimestamp,
          }),
          task(6, {
            title: 'Running without evidence',
            workflowState: 'running',
            linearUrl: null,
          }),
          task(7, { title: 'Blocked release', workflowState: 'blocked' }),
          task(8, {
            title: 'Verified release',
            workflowState: 'production-verified',
            pullRequest: pullRequest({
              number: 108,
              checks: { rollup: 'success', failing: [] },
            }),
          }),
        ])
      )
    );
    const user = userEvent.setup();

    renderMatrix();

    expect(await screen.findByText('Failing release')).toBeInTheDocument();
    expect(
      screen.getByText('8 open · 3 need attention · fresh cache')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Failing — PR Ready, biome +1')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Green')).toHaveLength(2);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getAllByText('UNKNOWN')).not.toHaveLength(0);
    expect(screen.getByText('#2 · awaiting checks')).toBeInTheDocument();

    const failingRow = screen.getByTestId('shipping-row-JOV-1');
    await user.click(
      screen.getByRole('button', { name: 'Inspect JOV-1: Failing release' })
    );
    expect(failingRow).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('complementary', { name: 'Work item details' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /#101 on GitHub/ })
    ).toHaveAttribute('href', 'https://github.com/JovieInc/Jovie/pull/101');
    expect(screen.getByRole('link', { name: /JOV-1/ })).toHaveAttribute(
      'href',
      'https://linear.app/jovie/issue/jov-1'
    );
    expect(screen.getByText('typecheck')).toBeInTheDocument();
    expect(screen.getByText(SHA.slice(0, 7))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(
      screen.queryByRole('complementary', { name: 'Work item details' })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Inspect JOV-6: Running without evidence',
      })
    );
    expect(
      screen.getByText('No external evidence links for this item.')
    ).toBeInTheDocument();
  });

  it('shows loading, then the empty live state', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolveFetch = resolve;
      })
    );

    renderMatrix();

    expect(screen.getByText('Loading in-flight work…')).toBeInTheDocument();
    await act(async () => {
      resolveFetch?.(jsonResponse(projection([])));
    });
    expect(
      await screen.findByText('No open lane pull requests.')
    ).toBeInTheDocument();
  });

  it('reports observation errors and refreshes successfully', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(projection([])));
    const user = userEvent.setup();

    renderMatrix();

    expect(
      await screen.findByText('Work matrix unavailable.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('UNKNOWN — observation failed. Refresh to retry.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText('No open lane pull requests.')
    ).toBeInTheDocument();
  });

  it('rejects an invalid shipping receipt', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ invalid: true }));

    renderMatrix();

    expect(
      await screen.findByText('Work matrix unavailable.')
    ).toBeInTheDocument();
  });
});
