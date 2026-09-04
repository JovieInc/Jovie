import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthLoader } from './AuthLoader';

const meta: Meta<typeof AuthLoader> = {
  title: 'Organisms/AuthLoader',
  component: AuthLoader,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex h-64 w-full items-stretch bg-surface-0'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
