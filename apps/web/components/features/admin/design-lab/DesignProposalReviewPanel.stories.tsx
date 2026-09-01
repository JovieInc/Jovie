'use client';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import { DesignProposalReviewPanel } from './DesignProposalReviewPanel';

const pendingResponse = {
  proposals: [
    {
      id: 'story-approve',
      surfaceId: 'ovie/mac-hud',
      surfaceName: 'Ovie Mac HUD',
      proposalText:
        'Move Taste Inbox above secondary diagnostics when there are pending decisions.',
      assetRefs: [],
      scoring: { weight: 1, score: 0.93 },
      linearIssueId: 'JOV-4796',
      linearIssueUrl:
        'https://linear.app/jovie/issue/JOV-4796/ovie-integrate-summer-and-a-working-taste-inbox-in-the-mac-app',
      status: 'pending',
      createdAt: '2026-09-01T12:00:00.000Z',
      reviewedAt: null,
      reviewer: null,
      reviewNotes: null,
      reviewDecision: null,
      dispatchId: null,
      dayBucket: '2026-09-01',
    },
    {
      id: 'story-reject',
      surfaceId: 'ovie/summer-entry',
      surfaceName: 'Summer Entry Point',
      proposalText:
        'Keep the operator Summer entry in Ovie and do not route it through artist-facing Jovie chat.',
      assetRefs: [],
      scoring: null,
      linearIssueId: 'JOV-4796',
      linearIssueUrl: null,
      status: 'pending',
      createdAt: '2026-09-01T12:08:00.000Z',
      reviewedAt: null,
      reviewer: null,
      reviewNotes: null,
      reviewDecision: null,
      dispatchId: null,
      dayBucket: '2026-09-01',
    },
  ],
  fetchedAt: '2026-09-01T12:10:00.000Z',
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}

function MockTasteInboxFetch({
  children,
  mode,
}: Readonly<{
  readonly children: ReactNode;
  readonly mode: 'pending' | 'forbidden';
}>) {
  useEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const path = rawUrl.startsWith('http')
        ? new URL(rawUrl).pathname
        : rawUrl;

      if (path === '/api/admin/design-lab/proposals') {
        if (mode === 'forbidden') {
          return jsonResponse(
            {
              error: 'Reverify with an admin Ovie account to load the Taste Inbox.',
              code: 'ovie_taste_inbox_forbidden',
              action: 'reverify_admin',
            },
            { status: 403 }
          );
        }

        return jsonResponse(pendingResponse);
      }

      if (
        path.startsWith('/api/admin/design-lab/proposals/') &&
        path.endsWith('/review')
      ) {
        return jsonResponse({
          ok: true,
          result: {
            dispatchTriggered: path.includes('story-approve'),
            linearUpdated: true,
          },
        });
      }

      if (typeof originalFetch === 'function') {
        return originalFetch(input, init);
      }

      return jsonResponse(
        { error: 'Unhandled story request' },
        { status: 404 }
      );
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [mode]);

  return children;
}

const meta = {
  title: 'Features/Admin/Design Lab/DesignProposalReviewPanel',
  component: DesignProposalReviewPanel,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[min(42rem,calc(100vw-2rem))]'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DesignProposalReviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  render: () => (
    <MockTasteInboxFetch mode='pending'>
      <DesignProposalReviewPanel />
    </MockTasteInboxFetch>
  ),
};

export const AuthorizationFailure: Story = {
  render: () => (
    <MockTasteInboxFetch mode='forbidden'>
      <DesignProposalReviewPanel />
    </MockTasteInboxFetch>
  ),
};
