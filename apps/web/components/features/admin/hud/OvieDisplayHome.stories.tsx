import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OvieDisplayHome } from './OvieDisplayHome';

/** Network-free: every feed answers 503, so the display shows its honest unavailable state. */
function stubFeeds() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/')) return new Response('{}', { status: 503 });
    return realFetch(input, init);
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}

const meta = {
  title: 'Features/Admin/Hud/OvieDisplayHome',
  component: OvieDisplayHome,
  beforeEach: stubFeeds,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof OvieDisplayHome>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FeedsUnavailable: Story = {};
