import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { MetadataAgentPanel } from './MetadataAgentPanel';

type Mode = 'pending' | 'offline' | 'error' | 'ready';

const provider = {
  id: 'xperi_allmusic_email',
  displayName: 'Xperi / AllMusic',
  transport: 'email',
  requiredInputs: [],
  launchReady: true,
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    providerId: 'xperi_allmusic_email',
    status: 'awaiting_approval',
    createdAt: '2026-09-20T00:00:00.000Z',
    approvedAt: null,
    sentAt: null,
    latestSnapshotAt: null,
    providerMessageId: null,
    lastError: null,
    missingFields: [],
    issues: [],
    targets: [],
    ...overrides,
  };
}

function LocalMetadataApi({
  mode,
  requests,
  children,
}: {
  readonly mode: Mode;
  readonly requests: unknown[];
  readonly children: ReactNode;
}) {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => {
      if (mode === 'offline') throw new TypeError('Failed to fetch');
      if (mode === 'pending') return new Promise<Response>(() => undefined);
      if (mode === 'error') return new Response('{}', { status: 500 });
      const body = String(input).includes('/providers')
        ? { providers: [provider] }
        : { requests, storageAvailable: true };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [mode, requests]);
  return <div className='w-full max-w-4xl'>{children}</div>;
}

const meta = {
  title: 'Features/Dashboard/ReleaseTasks/MetadataAgentPanel/States',
  component: MetadataAgentPanel,
  parameters: { layout: 'centered', mode: 'ready', requests: [] },
  args: {
    profileId: 'profile-1',
    releaseId: 'release-1',
    releaseTitle: 'Skyline Dreams',
  },
  decorators: [
    function MetadataApiDecorator(Story, context) {
      return (
        <LocalMetadataApi
          mode={context.parameters.mode as Mode}
          requests={context.parameters.requests as unknown[]}
        >
          <Story />
        </LocalMetadataApi>
      );
    },
  ],
} satisfies Meta<typeof MetadataAgentPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the status request never resolves. */
export const Loading: Story = { parameters: { mode: 'pending' } };

/** Empty: no package has been prepared yet. */
export const Empty: Story = {};

/** Error: the status request fails. */
export const ErrorLoadFailed: Story = { parameters: { mode: 'error' } };

/** Offline: the network request throws. */
export const Offline: Story = { parameters: { mode: 'offline' } };

/** Partial: a package with blocking missing fields. */
export const PartialMissingFields: Story = {
  parameters: {
    requests: [
      request({
        missingFields: [{ field: 'isrc', reason: 'Required by provider' }],
      }),
    ],
  },
};

/** Long content: many drift issues and a long release title. */
export const LongContent: Story = {
  args: {
    releaseTitle:
      'The Extraordinarily Long Titled Deluxe Anniversary Edition of Skyline Dreams',
  },
  parameters: {
    requests: [
      request({
        status: 'live',
        issues: Array.from({ length: 6 }, (_, index) => ({
          id: `issue-${index}`,
          field: `track_title_${index}`,
          issueType: 'value_mismatch',
          severity: 'high',
          expectedValue: 'Expected',
          observedValue: 'An observed value that is much longer than expected',
          status: 'open',
        })),
      }),
    ],
  },
};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: { releaseTitle: 'أحلام الأفق' },
};
