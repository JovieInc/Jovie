import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type {
  MerchDesignCarouselResult,
  MerchDesignPreview,
} from '@/lib/merch/types';
import {
  ChatMerchDesignCarousel,
  ChatMerchDesignCarouselLoading,
} from './ChatMerchDesignCarousel';

function makeDesign(
  overrides: Partial<MerchDesignPreview>
): MerchDesignPreview {
  return {
    id: 'design_1',
    option_number: 1,
    design_name: 'Midnight Drive Tee',
    concept: 'Neon skyline over a highway silhouette',
    status: 'ready',
    preview_url: 'https://placehold.co/320x320/111827/f5f5f5?text=Concept',
    slots: {} as MerchDesignPreview['slots'],
    ...overrides,
  } as unknown as MerchDesignPreview;
}

function makeResult(
  designs: readonly MerchDesignPreview[]
): MerchDesignCarouselResult {
  return {
    success: true,
    generationId: 'gen_1',
    designs,
  };
}

function QueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Jovie/ChatMerchDesignCarousel',
  component: ChatMerchDesignCarousel,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <QueryProvider>
        <Story />
      </QueryProvider>
    ),
  ],
} satisfies Meta<typeof ChatMerchDesignCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    result: makeResult([
      makeDesign({
        id: 'design_1',
        option_number: 1,
        design_name: 'Midnight Drive Tee',
      }),
      makeDesign({
        id: 'design_2',
        option_number: 2,
        design_name: 'Neon Highway Hoodie',
        preview_url: 'https://placehold.co/320x320/1f2937/f5f5f5?text=Concept',
      }),
      makeDesign({
        id: 'design_3',
        option_number: 3,
        design_name: 'Skyline Poster Tee',
        preview_url: 'https://placehold.co/320x320/374151/f5f5f5?text=Concept',
      }),
    ]),
  },
};

export const Rendering: Story = {
  args: {
    result: makeResult([
      makeDesign({
        id: 'design_1',
        status: 'generating',
        preview_url: undefined,
      }),
      makeDesign({
        id: 'design_2',
        status: 'generating',
        preview_url: undefined,
      }),
      makeDesign({
        id: 'design_3',
        status: 'generating',
        preview_url: undefined,
      }),
    ]),
  },
};

export const MockupFailed: Story = {
  args: {
    result: makeResult([
      makeDesign({
        id: 'design_1',
        status: 'generating',
        mockup_status: 'mockup_failed',
        preview_url: undefined,
      }),
    ]),
  },
};

export const Loading: Story = {
  args: {
    result: makeResult([]),
  },
  render: () => <ChatMerchDesignCarouselLoading />,
};

export const EmptyBatch: Story = {
  args: {
    result: makeResult([]),
  },
};

const threeReadyDesigns = makeResult([
  makeDesign({ id: 'design_1', option_number: 1 }),
  makeDesign({
    id: 'design_2',
    option_number: 2,
    design_name: 'Neon Highway Hoodie',
  }),
  makeDesign({
    id: 'design_3',
    option_number: 3,
    design_name: 'Skyline Poster Tee',
  }),
]);

/**
 * Select posts to /api/chat/confirm-merch-action. These stories answer that
 * one route from a fixture so pressing Select never leaves the browser.
 */
function stubMerchActionRoute(respond: () => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    if (String(input).includes('/api/chat/confirm-merch-action'))
      return respond();
    throw new Error('Unexpected network request in merch carousel story.');
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function selectFirstConceptAndExpect(
  canvasElement: HTMLElement,
  message: string
) {
  const canvas = within(canvasElement);
  const [first] = canvas.getAllByRole('button', { name: 'Select' });
  await userEvent.click(first);
  await waitFor(() => expect(canvas.getByText(message)).toBeVisible());
}

/** The product lookup failed on the server: the concepts stay and say so. */
export const ErrorProductsUnavailable: Story = {
  args: { result: threeReadyDesigns, profileId: 'story-profile' },
  beforeEach: () =>
    stubMerchActionRoute(
      async () =>
        new Response(JSON.stringify({ error: 'Printful unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
    ),
  play: ({ canvasElement }) =>
    selectFirstConceptAndExpect(
      canvasElement,
      'Unable to load products. Try again.'
    ),
};

/** The request never left the device: same recoverable message, concepts kept. */
export const OfflineProductsRequest: Story = {
  args: { result: threeReadyDesigns, profileId: 'story-profile' },
  beforeEach: () =>
    stubMerchActionRoute(async () => {
      throw new TypeError('Failed to fetch');
    }),
  play: ({ canvasElement }) =>
    selectFirstConceptAndExpect(
      canvasElement,
      'Unable to load products. Try again.'
    ),
};

/** One concept ready, one still rendering, one whose mockup failed. */
export const PartialReadiness: Story = {
  args: {
    result: makeResult([
      makeDesign({ id: 'design_1', option_number: 1 }),
      makeDesign({
        id: 'design_2',
        option_number: 2,
        design_name: 'Neon Highway Hoodie',
        status: 'generating',
        preview_url: undefined,
      }),
      makeDesign({
        id: 'design_3',
        option_number: 3,
        design_name: 'Skyline Poster Tee',
        status: 'generating',
        mockup_status: 'mockup_failed',
        preview_url: undefined,
      }),
    ]),
  },
};

/** Long concept names clamp to three lines; the Select row stays aligned. */
export const LongContent: Story = {
  args: {
    result: makeResult([
      makeDesign({
        id: 'design_1',
        option_number: 1,
        design_name:
          'The Extended Midnight Drive Sessions Deluxe Anniversary Edition Tee',
      }),
      makeDesign({
        id: 'design_2',
        option_number: 2,
        design_name:
          'Neon Highway Hoodie With Hand-Lettered Back Print And Sleeve Tour Dates',
      }),
      makeDesign({ id: 'design_3', option_number: 3, design_name: 'Skyline' }),
    ]),
  },
};

export const RtlConcepts: Story = {
  args: {
    result: makeResult([
      makeDesign({
        id: 'design_1',
        option_number: 1,
        design_name: 'قميص الليل',
      }),
      makeDesign({
        id: 'design_2',
        option_number: 2,
        design_name: 'هودي الطريق السريع',
      }),
      makeDesign({
        id: 'design_3',
        option_number: 3,
        design_name: 'ملصق الأفق',
      }),
    ]),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
