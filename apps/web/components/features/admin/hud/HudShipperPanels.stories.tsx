'use client';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import type {
  HudGithubRateLimitsPayload,
  HudShipperStatusPayload,
} from '@/types/hud-shipper';
import { HudGithubBudgetPanel, HudShipperNeedPanel } from './HudShipperPanels';

const generatedAtIso = '2026-09-01T12:01:00.000Z';

const shipper: HudShipperStatusPayload = {
  availability: 'available',
  state: 'running',
  isPaused: false,
  launchdLoaded: true,
  lastRunAt: '2026-09-01T12:00:00.000Z',
  lastResult: 'dispatched 2',
  dispatchableCount: 4,
  inFlightCount: 1,
  inFlightJobs: [
    {
      job: 'ship-1',
      repo: 'jovie',
      issue: 42,
      branch: 'claude/example',
      worktree: '/tmp/wt',
      pid: 1234,
      startedAt: '2026-09-01T12:00:00.000Z',
    },
  ],
  currentAgents: [],
  lastError: null,
  recentErrors: [],
  capacity: null,
  generatedAtIso,
};

const rateLimits: HudGithubRateLimitsPayload = {
  availability: 'available',
  core: { limit: 5000, remaining: 4200, resetAtIso: generatedAtIso },
  graphql: { limit: 5000, remaining: 100, resetAtIso: generatedAtIso },
  generatedAtIso,
};

type Mode = 'ok' | 'pending' | 'error' | 'offline';

function MockHudFetch({
  mode,
  shipperBody = shipper,
  children,
}: Readonly<{
  readonly mode: Mode;
  readonly shipperBody?: HudShipperStatusPayload;
  readonly children: ReactNode;
}>) {
  // Layout effect so the mock is installed before the panel's own query runs.
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => {
      const url = typeof input === 'string' ? input : String(input);
      if (mode === 'pending') return new Promise<Response>(() => {});
      if (mode === 'offline') throw new TypeError('Failed to fetch');
      if (mode === 'error') return new Response('{}', { status: 500 });
      const body = url.includes('github-rate-limits')
        ? rateLimits
        : shipperBody;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [mode, shipperBody]);

  return children;
}

const meta = {
  title: 'Features/Admin/Hud/HudShipperPanels',
  component: HudShipperNeedPanel,
  args: { source: 'admin-session' },
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-xl'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HudShipperNeedPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function renderPanel(mode: Mode, body?: HudShipperStatusPayload) {
  return (
    <MockHudFetch mode={mode} shipperBody={body}>
      <HudShipperNeedPanel source='admin-session' />
    </MockHudFetch>
  );
}

export const Default: Story = {
  render: () => renderPanel('ok'),
};

export const Loading: Story = { render: () => renderPanel('pending') };

/** Idle shipper with nothing dispatchable and no history. */
export const Empty: Story = {
  render: () =>
    renderPanel('ok', {
      ...shipper,
      state: 'idle',
      lastRunAt: null,
      lastResult: null,
      dispatchableCount: 0,
      inFlightCount: 0,
      inFlightJobs: [],
    }),
};

export const ErrorState: Story = { render: () => renderPanel('error') };

export const Offline: Story = { render: () => renderPanel('offline') };

/** The shipper errored: shows the last error and the recent log tail. */
export const Partial: Story = {
  render: () =>
    renderPanel('ok', {
      ...shipper,
      state: 'error',
      lastError: 'Dispatch failed: worktree is dirty',
      recentErrors: ['warn: retrying', 'error: worktree is dirty'],
    }),
};

export const LongContent: Story = {
  render: () =>
    renderPanel('ok', {
      ...shipper,
      inFlightJobs: [
        {
          ...shipper.inFlightJobs[0],
          branch:
            'claude/a-deliberately-very-long-branch-name-that-keeps-going-to-prove-it-wraps-cleanly-inside-the-ledger',
        },
      ],
      lastError: 'A long error message that wraps. '.repeat(8),
      recentErrors: Array.from({ length: 30 }, (_, i) => `log line ${i + 1}`),
    }),
};

/** The kiosk token path never sees shipper status. */
export const PermissionDenied: Story = {
  args: { source: 'kiosk-token' },
};

export const RtlOverflow: Story = {
  render: () => <div dir='rtl'>{renderPanel('ok')}</div>,
};

export const GithubBudget: Story = {
  render: () => (
    <MockHudFetch mode='ok'>
      <HudGithubBudgetPanel />
    </MockHudFetch>
  ),
};
