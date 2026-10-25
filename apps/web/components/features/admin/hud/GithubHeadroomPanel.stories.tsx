import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GithubHeadroomPanel } from './GithubHeadroomPanel';

/** Network-free: the shipping read is unavailable, so the panel reads Unknown. */
function stubShipping() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/hud/shipping-state'))
      return new Response('{}', { status: 503 });
    return realFetch(input, init);
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}

const meta = {
  title: 'Features/Admin/Hud/GithubHeadroomPanel',
  component: GithubHeadroomPanel,
  beforeEach: stubShipping,
  parameters: { layout: 'padded' },
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
} satisfies Meta<typeof GithubHeadroomPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unknown: Story = {};
