import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { type AdminLeadKeyword, queryKeys } from '@/lib/queries';
import { LeadKeywordsManager } from './LeadKeywordsManager';

type LeadKeywordsManagerArgs = ComponentProps<typeof LeadKeywordsManager>;

/**
 * Rendered states of the discovery keyword manager. Stories seed the keyword
 * query in their own client, and stub fetch for the one mutation they send.
 */
const meta = {
  title: 'Features/Admin/Leads/LeadKeywordsManager/States',
  component: LeadKeywordsManager,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof LeadKeywordsManager>;

export default meta;
type Story = StoryObj<typeof meta>;

function keyword(
  index: number,
  overrides: Partial<AdminLeadKeyword> = {}
): AdminLeadKeyword {
  return {
    id: `keyword-${index}`,
    query: `site:linktr.ee "music" "spotify" ${index}`,
    enabled: index % 2 === 1,
    resultsFoundTotal: index * 12,
    lastUsedAt: null,
    ...overrides,
  };
}

function withKeywords(
  keywords: AdminLeadKeyword[] | null
): Decorator<LeadKeywordsManagerArgs> {
  return function WithKeywords(Story) {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    if (keywords) {
      client.setQueryData(queryKeys.admin.leads.keywords(), { keywords });
    }
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
}

function stubFetch(respond: () => Promise<Response>) {
  return () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => respond();
    return () => {
      globalThis.fetch = realFetch;
    };
  };
}

/** Loading: the keyword list has not arrived yet. */
export const LoadingKeywords: Story = {
  decorators: [withKeywords(null)],
  beforeEach: stubFetch(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Loading keywords...')
    ).toBeInTheDocument();
  },
};

/** Empty: no keyword is configured yet, so only the add field shows. */
export const EmptyKeywords: Story = {
  decorators: [withKeywords([])],
};

/** Error: the API refuses the new keywords and the error toast shows. */
export const ErrorAddKeywords: Story = {
  decorators: [withKeywords([keyword(1)])],
  beforeEach: stubFetch(async () =>
    Response.json({ error: 'Keyword limit reached' }, { status: 422 })
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText('New Discovery Keywords'),
      'site:linktr.ee "artist" "tour"'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Add Keywords' }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText('Failed to add keywords')
    ).toBeInTheDocument();
  },
};

/** Offline: toggling a keyword cannot reach the API and the toast says so. */
export const OfflineToggle: Story = {
  decorators: [withKeywords([keyword(1)])],
  beforeEach: stubFetch(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('switch', { name: `Toggle ${keyword(1).query}` })
    );
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText('Failed to toggle keyword')
    ).toBeInTheDocument();
  },
};

/** Long content: many long queries scroll inside the capped list. */
export const LongContentKeywords: Story = {
  decorators: [
    withKeywords(
      Array.from({ length: 18 }, (_, index) =>
        keyword(index + 1, {
          query: `site:linktr.ee "independent electronic music producer" "spotify" "soundcloud" "bandcamp" ${index + 1}`,
          resultsFoundTotal: 12_480 + index,
        })
      )
    ),
  ],
};

const withRtl: Decorator<LeadKeywordsManagerArgs> = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: Arabic keyword queries in a right-to-left admin page. */
export const RtlKeywords: Story = {
  decorators: [
    withRtl,
    withKeywords([
      keyword(1, { query: 'site:linktr.ee "موسيقى" "سبوتيفاي"' }),
      keyword(2, { query: 'site:linktr.ee "فنان" "جولة"' }),
    ]),
  ],
};
