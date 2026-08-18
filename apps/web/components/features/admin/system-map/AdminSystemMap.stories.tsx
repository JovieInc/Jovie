import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminSystemMap } from './AdminSystemMap';

const meta = {
  title: 'Features/Admin/System Map/AdminSystemMap',
  component: AdminSystemMap,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-screen bg-surface-page p-4 sm:p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdminSystemMap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connectors: Story = { args: { activeTab: 'connectors' } };

export const Tools: Story = { args: { activeTab: 'tools' } };

export const Memory: Story = { args: { activeTab: 'memory' } };

export const MobileMemory: Story = {
  args: { activeTab: 'memory' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
