'use client';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
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

const fetchedAt = '2026-09-01T12:10:00.000Z';

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
  readonly mode:
    | 'pending'
    | 'forbidden'
    | 'loading'
    | 'empty'
    | 'error'
    | 'offline'
    | 'long'
    | 'partial';
}>) {
  // Layout effect so the mock is installed before the panel's own useEffect
  // fetch fires (passive effects run bottom-up after all layout effects).
  useLayoutEffect(() => {
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
        if (mode === 'loading') {
          return new Promise<Response>(() => {});
        }

        if (mode === 'offline') {
          throw new TypeError('Failed to fetch');
        }

        if (mode === 'error') {
          return jsonResponse(
            { error: 'Taste Inbox is temporarily unavailable.' },
            { status: 500 }
          );
        }

        if (mode === 'empty') {
          return jsonResponse({ proposals: [], fetchedAt });
        }

        if (mode === 'long') {
          return jsonResponse({
            proposals: [
              {
                ...pendingResponse.proposals[0],
                id: 'story-long',
                surfaceName:
                  'A very long surface name that keeps going well past the width of the card to prove it truncates or wraps cleanly',
                proposalText:
                  'A deliberately long proposal body that wraps across many lines so the card has to grow rather than clip the decision buttons. '.repeat(
                    6
                  ),
              },
            ],
            fetchedAt,
          });
        }

        if (mode === 'partial') {
          return jsonResponse({
            proposals: [
              {
                ...pendingResponse.proposals[1],
                id: 'story-partial',
                scoring: null,
                linearIssueId: null,
                linearIssueUrl: null,
              },
            ],
            fetchedAt,
          });
        }

        if (mode === 'forbidden') {
          return jsonResponse(
            {
              error:
                'Reverify with an admin Ovie account to load the Taste Inbox.',
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
    jovie: {
      uncoveredProps: ['isLoading'],
    },
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

export const Loading: Story = {
  render: () => (
    <MockTasteInboxFetch mode='loading'>
      <DesignProposalReviewPanel />
    </MockTasteInboxFetch>
  ),
};

/** Signed in without an admin Ovie account: the inbox asks to reverify. */
export const PermissionDenied: Story = {
  render: () => (
    <MockTasteInboxFetch mode='forbidden'>
      <DesignProposalReviewPanel />
    </MockTasteInboxFetch>
  ),
};

/** No pending taste proposals. */
export const Empty: Story = {
  render: () => (
    <MockTasteInboxFetch mode='empty'>
      <DesignProposalReviewPanel />
    </MockTasteInboxFetch>
  ),
};

/** The proposals request fails with a server error. */
export const Error: Story = {
  render: () => (
    <MockTasteInboxFetch mode='error'>
      <DesignProposalReviewPanel />
    </MockTasteInboxFetch>
  ),
};

/** The browser is offline: the fetch rejects. */
export const Offline: Story = {
  render: () => (
    <MockTasteInboxFetch mode='offline'>
      <DesignProposalReviewPanel />
    </MockTasteInboxFetch>
  ),
};

/** A very long surface name and proposal body. */
export const LongContent: Story = {
  render: () => (
    <MockTasteInboxFetch mode='long'>
      <DesignProposalReviewPanel />
    </MockTasteInboxFetch>
  ),
};

/** A proposal with no score and no Linear issue. */
export const Partial: Story = {
  render: () => (
    <MockTasteInboxFetch mode='partial'>
      <DesignProposalReviewPanel />
    </MockTasteInboxFetch>
  ),
};

/** Right-to-left page direction. */
export const RtlPending: Story = {
  render: () => (
    <MockTasteInboxFetch mode='pending'>
      <div dir='rtl'>
        <DesignProposalReviewPanel />
      </div>
    </MockTasteInboxFetch>
  ),
};
