import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
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
  render: () => <ChatMerchDesignCarouselLoading />,
};
