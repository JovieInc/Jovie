import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WebMcpTools } from './WebMcpTools';

const meta = {
  title: 'Marketing/WebMcpTools',
  component: WebMcpTools,
  parameters: {
    docs: {
      description: {
        component:
          'Homepage WebMCP adapter. Renders no visible UI and registers a read-only public profile tool only when the browser exposes modelContext. Component tests cover registration, failure handling and unmount cleanup.',
      },
    },
  },
} satisfies Meta<typeof WebMcpTools>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mounted: Story = {};
