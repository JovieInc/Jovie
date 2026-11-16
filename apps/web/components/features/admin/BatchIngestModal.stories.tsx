import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { BatchIngestApiResponse } from '@/lib/queries';
import { BatchIngestModal } from './BatchIngestModal';

type BatchRespond = () => Promise<Response>;

const BATCH_ROUTE = '/api/admin/batch-ingest';

/**
 * Answers the batch-ingest route for one story and restores the real fetch
 * when the story unmounts. Every other request goes to the real fetch.
 */
function BatchRouteFixture({
  respond,
  children,
}: Readonly<{ respond: BatchRespond; children: ReactNode }>) {
  const [restore] = useState(() => {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(BATCH_ROUTE)) return respond();
      return original(input, init);
    }) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  });
  useEffect(() => restore, [restore]);
  return <>{children}</>;
}

function withBatchRoute(respond: BatchRespond) {
  return [
    function WithBatchRouteDecorator(Story: () => ReactNode) {
      return (
        <BatchRouteFixture respond={respond}>
          <Story />
        </BatchRouteFixture>
      );
    },
  ];
}

function jsonResponse(body: BatchIngestApiResponse) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

async function pasteAndRun(canvasElement: HTMLElement, urls: string) {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.type(await body.findByRole('textbox'), urls);
  await userEvent.click(body.getByRole('button', { name: 'Run batch import' }));
  return body;
}

const meta = {
  title: 'Features/Admin/BatchIngestModal',
  component: BatchIngestModal,
  parameters: { layout: 'centered' },
  args: { open: true, onOpenChange: () => undefined },
} satisfies Meta<typeof BatchIngestModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing pasted yet, so zero URLs parse and the run stays disabled. */
export const EmptyNoUrls: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole('button', { name: 'Run batch import' })
    ).toBeDisabled();
  },
};

/** Loading: the batch request is in flight and every control is disabled. */
export const LoadingIngest: Story = {
  decorators: withBatchRoute(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    const body = await pasteAndRun(canvasElement, 'https://linktr.ee/ava');
    await expect(
      await body.findByRole('button', { name: 'Ingesting…' })
    ).toBeDisabled();
  },
};

/** Error: the batch ran but some URLs failed, each with its reason. */
export const ErrorRowsInResult: Story = {
  decorators: withBatchRoute(() =>
    jsonResponse({
      results: [
        { input: 'https://linktr.ee/ava', status: 'success', username: 'ava' },
        {
          input: 'https://example.invalid/nope',
          status: 'error',
          reason: 'Unsupported URL',
        },
      ],
      summary: { total: 2, success: 1, skipped: 0, error: 1 },
    })
  ),
  play: async ({ canvasElement }) => {
    const body = await pasteAndRun(
      canvasElement,
      'https://linktr.ee/ava, https://example.invalid/nope'
    );
    await expect(await body.findByText('1 errors')).toBeInTheDocument();
  },
};

const LONG_RESULTS: BatchIngestApiResponse['results'] = Array.from(
  { length: 14 },
  (_, index) => ({
    input: `https://open.spotify.com/artist/${'0'.repeat(10)}${index}-an-unusually-long-artist-identifier`,
    status: index % 3 === 0 ? 'skipped' : 'success',
    username:
      index % 3 === 0 ? undefined : `artist-with-a-long-handle-${index}`,
    reason: index % 3 === 0 ? 'Profile already exists' : undefined,
  })
);

/** Long content: fourteen long URLs scroll inside the capped result list. */
export const LongContentResults: Story = {
  decorators: withBatchRoute(() =>
    jsonResponse({
      results: LONG_RESULTS,
      summary: { total: 14, success: 9, skipped: 5, error: 0 },
    })
  ),
  play: async ({ canvasElement }) => {
    const body = await pasteAndRun(canvasElement, 'https://linktr.ee/ava');
    await expect(await body.findByText('9 created')).toBeInTheDocument();
  },
};

/** Offline: the request never reached the server; the pasted URLs stay. */
export const OfflineRequest: Story = {
  decorators: withBatchRoute(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    const body = await pasteAndRun(canvasElement, 'https://linktr.ee/ava');
    await waitFor(() =>
      expect(
        body.getByRole('button', { name: 'Run batch import' })
      ).toBeEnabled()
    );
    await expect(body.getByRole('textbox')).toHaveValue(
      'https://linktr.ee/ava'
    );
  },
};

/** Right-to-left: the dialog inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
