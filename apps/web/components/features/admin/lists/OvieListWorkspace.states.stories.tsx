import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator, ListDetail } from '@/lib/ovie/lists/types';
import { OvieListWorkspace } from './OvieListWorkspace';

const DETAIL_PATH = '/api/admin/ov-lists/collab';
const AT = '2026-10-04T03:00:00.000Z';

function member(creatorId: string, extra: Partial<ListMember> = {}) {
  return {
    creatorId,
    state: 'member',
    rating: null,
    favorite: false,
    source: 'manual',
    addedAt: AT,
    ...extra,
  } as ListMember;
}

function detail(
  name: string,
  creators: ListCreator[],
  members: ListMember[]
): ListDetail {
  return {
    list: {
      id: 'collab',
      name,
      pinned: true,
      createdAt: AT,
      updatedAt: AT,
      members,
      labels: [],
    },
    creators,
    precision: { accepted: 0, rejected: 0, pending: 0, precision: null },
  };
}

/** Answers the list read for one story; nothing reaches the API. */
function stubDetail(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === DETAIL_PATH) return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

function WorkspaceFrame({ dir = 'ltr' }: { readonly dir?: 'ltr' | 'rtl' }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  );
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='ov-mode h-screen bg-base'>
        <OvieListWorkspace listId='collab' />
      </div>
    </QueryClientProvider>
  );
}

function renderWorkspace() {
  return <WorkspaceFrame />;
}

function renderRtlWorkspace() {
  return <WorkspaceFrame dir='rtl' />;
}

const meta = {
  title: 'Features/Admin/Lists/OvieListWorkspace States',
  component: OvieListWorkspace,
  parameters: { layout: 'fullscreen' },
  args: { listId: 'collab' },
  render: renderWorkspace,
} satisfies Meta<typeof OvieListWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the list read never answers, so the busy placeholder holds. */
export const LoadingList: Story = {
  beforeEach: stubDetail(() => new Promise<Response>(() => {})),
};

/** Error: the read answers 500 twice and the workspace offers Retry. */
export const ErrorListUnavailable: Story = {
  beforeEach: stubDetail(async () =>
    Response.json({ error: 'boom' }, { status: 500 })
  ),
};

/** Offline: the read cannot leave the browser. */
export const OfflineListUnreachable: Story = {
  beforeEach: stubDetail(async () => {
    throw new TypeError('Failed to fetch');
  }),
};

const longCreators: ListCreator[] = Array.from({ length: 30 }, (_, index) => ({
  id: `creator-${index}`,
  username: `themidnightcollective${index + 1}`,
  displayName: `The Midnight Collective Featuring The Northern Lights Orchestra ${index + 1}`,
  avatarUrl: null,
  genres: ['progressive psychedelic shoegaze', 'ambient neoclassical'],
  spotifyFollowers: 2_400_000,
  location: 'Llanfairpwllgwyngyll, Wales',
}));

/** Long content: thirty long-named members and five long suggestions. */
export const LongContentManyCreators: Story = {
  beforeEach: stubDetail(async () =>
    Response.json(
      detail(
        'Summer festival openers, late additions and everyone we still need to hear back from',
        longCreators,
        longCreators.map((creator, index) =>
          index < 25
            ? member(creator.id, { rating: (index % 5) + 1 })
            : member(creator.id, {
                state: 'suggested',
                source: 'suggestion',
                suggestionReasons: [
                  'Shares progressive psychedelic shoegaze with 24 of 25 picks',
                ],
              })
        )
      )
    )
  ),
};

/** RTL: Arabic list and creator names in a right-to-left workspace. */
export const RtlArabicList: Story = {
  beforeEach: stubDetail(async () =>
    Response.json(
      detail(
        'قائمة الصيف',
        [
          {
            id: 'a',
            username: 'layla',
            displayName: 'ليلى الحداد',
            avatarUrl: null,
            genres: ['indie pop'],
            spotifyFollowers: 25_000,
            location: 'بيروت',
          },
          {
            id: 'b',
            username: 'omar',
            displayName: 'عمر الخطيب',
            avatarUrl: null,
          },
        ],
        [
          member('a', { rating: 4, favorite: true }),
          member('b', {
            state: 'suggested',
            source: 'suggestion',
            suggestionReasons: ['يشارك النوع نفسه مع اختيارين'],
          }),
        ]
      )
    )
  ),
  render: renderRtlWorkspace,
};
