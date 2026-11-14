import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import type { SmartViewDetail } from '@/lib/ovie/lists/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieSmartViewWorkspace } from './OvieSmartViewWorkspace';

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;
type ApiMockWindow = Window & { __jovieApiMock?: ApiMock };

/** Answers the smart view request through the preview's per-story API hook. */
function stubViewRequest(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname.startsWith('/api/admin/ov-lists/views/')
      ? respond()
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

function withView(detail: SmartViewDetail | null, dir?: 'rtl') {
  return function ViewStateDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (detail) {
      client.setQueryData(queryKeys.admin.lists.view(detail.view.id), detail);
    }
    return (
      <QueryClientProvider client={client}>
        <div className='ov-mode h-screen bg-base' dir={dir}>
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

const ADDED_AT = '2026-10-04T03:00:00.000Z';

const meta = {
  title: 'Features/Admin/Lists/OvieSmartViewWorkspace States',
  component: OvieSmartViewWorkspace,
  parameters: { layout: 'fullscreen' },
  args: { viewId: 'favorites' },
} satisfies Meta<typeof OvieSmartViewWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the view request is still in flight. */
export const LoadingView: Story = {
  decorators: [withView(null)],
  beforeEach: () => stubViewRequest(() => new Promise<Response>(() => {})),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('status', { name: 'Loading View' })
    ).toHaveAttribute('aria-busy', 'true');
  },
};

/** Error: the server answers with a failure and the page offers a retry. */
export const ErrorViewUnavailable: Story = {
  decorators: [withView(null)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('View unavailable', undefined, {
        timeout: 4_000,
      })
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** Offline: the request never reaches the server; the same retry is offered. */
export const OfflineViewUnavailable: Story = {
  decorators: [withView(null)],
  beforeEach: () =>
    stubViewRequest(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('View unavailable', undefined, {
        timeout: 4_000,
      })
    ).toBeVisible();
  },
};

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';
const LONG_LIST =
  'Press contacts for the spring remix package, second round of replies';

/** Long content: a long creator name and list name stay inside the row. */
export const LongContentRows: Story = {
  decorators: [
    withView({
      view: { id: 'favorites', name: 'Favorites' },
      rows: [
        {
          listId: 'press',
          listName: LONG_LIST,
          member: {
            creatorId: 'a',
            state: 'member',
            rating: 5,
            favorite: true,
            source: 'manual',
            addedAt: ADDED_AT,
          },
        },
      ],
      creators: [
        {
          id: 'a',
          username: 'aurelia-montgomery-fitzgerald-official',
          displayName: LONG_NAME,
          avatarUrl: null,
        },
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: LONG_LIST })).toBeVisible();
  },
};

/** Right-to-left: rows mirror inside an RTL document. */
export const RtlRows: Story = {
  decorators: [
    withView(
      {
        view: { id: 'favorites', name: 'المفضلة' },
        rows: [
          {
            listId: 'press',
            listName: 'الصحافة',
            member: {
              creatorId: 'a',
              state: 'member',
              rating: 4,
              favorite: true,
              source: 'manual',
              addedAt: ADDED_AT,
            },
          },
        ],
        creators: [
          { id: 'a', username: 'layla', displayName: 'ليلى', avatarUrl: null },
        ],
      },
      'rtl'
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'الصحافة' })).toBeVisible();
  },
};
