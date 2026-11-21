'use client';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import type {
  VisualQaReviewRun,
  VisualQaReviewSurface,
} from '@/lib/agent-os/visual-qa/review';
import { VisualQaReviewPanel } from './VisualQaReviewPanel';

function surface(
  overrides: Partial<VisualQaReviewSurface> = {}
): VisualQaReviewSurface {
  return {
    surfaceId: 'admin-hud',
    title: 'Admin HUD',
    baselinePath: 'baseline.png',
    afterPath: 'after.png',
    overlayPath: 'overlay.png',
    rawDiffRatio: 0.02,
    weightedDriftScore: 0.0412,
    threshold: 0.01,
    status: 'drift_detected',
    review: null,
    ...overrides,
  };
}

function run(surfaces: VisualQaReviewSurface[]): VisualQaReviewRun {
  return {
    runId: 'run-2026-09-01',
    computedAt: '2026-09-01T12:00:00.000Z',
    passed: false,
    surfaces,
  };
}

type Mode = 'runs' | 'pending' | 'error' | 'offline';

function MockVisualQaFetch({
  mode,
  runs = [],
  children,
}: Readonly<{
  readonly mode: Mode;
  readonly runs?: readonly VisualQaReviewRun[];
  readonly children: ReactNode;
}>) {
  // Layout effect so the mock is installed before the panel's own fetch.
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      if (mode === 'pending') return new Promise<Response>(() => {});
      if (mode === 'offline') throw new TypeError('Failed to fetch');
      if (mode === 'error') return new Response('{}', { status: 500 });
      return new Response(
        JSON.stringify({ runs, fetchedAt: '2026-09-01T12:10:00.000Z' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [mode, runs]);

  return children;
}

const meta = {
  title: 'Features/Admin/Hud/VisualQaReviewPanel',
  component: VisualQaReviewPanel,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[min(48rem,calc(100vw-2rem))]'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VisualQaReviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function panel(mode: Mode, runs?: readonly VisualQaReviewRun[]) {
  return (
    <MockVisualQaFetch mode={mode} runs={runs}>
      <VisualQaReviewPanel />
    </MockVisualQaFetch>
  );
}

export const Default: Story = {
  render: () => panel('runs', [run([surface()])]),
};

export const Loading: Story = { render: () => panel('pending') };

export const Empty: Story = { render: () => panel('runs', []) };

/** The runs request returns a server error; the panel falls back to empty. */
export const ErrorState: Story = { render: () => panel('error') };

export const Offline: Story = { render: () => panel('offline') };

/** A surface with no capture and no overlay, and one already reviewed. */
export const Partial: Story = {
  render: () =>
    panel('runs', [
      run([
        surface({
          surfaceId: 'missing',
          title: 'Billing',
          status: 'missing_capture',
          overlayPath: null,
          weightedDriftScore: null,
        }),
        surface({
          surfaceId: 'reviewed',
          title: 'Settings',
          status: 'no_significant_change',
          review: {
            surfaceId: 'reviewed',
            decision: 'accepted',
            reviewer: 'founder@example.com',
            reviewedAt: '2026-09-01T13:00:00.000Z',
            notes: null,
            followUpAction: null,
            dispatchId: null,
          },
        }),
      ]),
    ]),
};

export const LongContent: Story = {
  render: () =>
    panel('runs', [
      run([
        surface({
          title:
            'A deliberately very long surface title that keeps going well past the width of the card to prove it wraps',
          surfaceId:
            'a-very-long-surface-identifier-that-should-wrap-inside-the-card',
        }),
      ]),
    ]),
};

export const RtlOverflow: Story = {
  render: () => <div dir='rtl'>{panel('runs', [run([surface()])])}</div>,
};
