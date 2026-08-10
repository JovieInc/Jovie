import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoVideoPage } from '@/components/features/demo/DemoVideoPage';

const meta = {
  title: 'Marketing/Routes/DemoVideo',
  component: DemoVideoPage,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1024] },
    pen: {
      registryIds: ['web-028-demo--video', 'web-029-demovideo'],
      routes: ['/demo/video', '/demovideo'],
      source: 'apps/web/components/features/demo/DemoVideoPage.tsx',
      sourceExport: 'DemoVideoPage',
      sourceSha: '409c25a77213f414ce86cad81042505ddc85ea96',
      implementation: 'exact-production-component',
    },
    docs: {
      description: {
        component:
          'Exact DemoVideoPage body shared by /demo/video and /demovideo. Route metadata, revalidation, and noindex policy remain route-owned.',
      },
    },
  },
} satisfies Meta<typeof DemoVideoPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web028DemoVideo: Story = {
  name: 'web-028 /demo/video',
  parameters: {
    pen: {
      registryId: 'web-028-demo--video',
      route: '/demo/video',
      storyExport: 'Web028DemoVideo',
    },
  },
};

export const Web029DemoVideoAlias: Story = {
  name: 'web-029 /demovideo',
  parameters: {
    pen: {
      registryId: 'web-029-demovideo',
      route: '/demovideo',
      storyExport: 'Web029DemoVideoAlias',
    },
  },
};
