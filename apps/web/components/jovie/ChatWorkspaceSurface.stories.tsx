import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatWorkspaceSurface } from './ChatWorkspaceSurface';

const meta = {
  title: 'Jovie/ChatWorkspaceSurface',
  component: ChatWorkspaceSurface,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <div className='flex h-full flex-col justify-between p-4'>
        <p className='text-sm text-secondary-token'>Chat transcript</p>
        <div className='rounded-lg border border-subtle bg-surface-0 p-3 text-sm text-primary-token'>
          Composer
        </div>
      </div>
    ),
  },
} satisfies Meta<typeof ChatWorkspaceSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    Story => (
      <div className='h-96 bg-base'>
        <Story />
      </div>
    ),
  ],
};
