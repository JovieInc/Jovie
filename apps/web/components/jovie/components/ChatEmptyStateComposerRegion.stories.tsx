import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatEmptyStateComposerRegion } from './ChatEmptyStateComposerRegion';

const composer = (
  <div className='rounded-lg border border-border-token bg-surface-1 px-4 py-3 text-sm text-secondary-token'>
    Ask Jovie anything
  </div>
);

const meta: Meta<typeof ChatEmptyStateComposerRegion> = {
  title: 'Jovie/Components/ChatEmptyStateComposerRegion',
  component: ChatEmptyStateComposerRegion,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='h-[480px] bg-surface-0 p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: composer,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Centered: Story = {};

export const DockedWithStarter: Story = {
  args: {
    above: (
      <div className='rounded-lg border border-border-token bg-surface-1 p-4 text-sm text-secondary-token'>
        Sample conversation
      </div>
    ),
    children: composer,
  },
};
