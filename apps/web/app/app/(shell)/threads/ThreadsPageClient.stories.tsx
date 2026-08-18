import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatsEmptyState } from './ThreadsPageClient';

const meta = {
  title: 'App/Chats/Empty State',
  component: ChatsEmptyState,
  parameters: { layout: 'fullscreen' },
  args: { query: '' },
  render: args => (
    <div className='flex h-[32rem] bg-(--app-shell-content-surface)'>
      <ChatsEmptyState {...args} />
    </div>
  ),
} satisfies Meta<typeof ChatsEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoChats: Story = {};

export const NoSearchResults: Story = {
  args: { query: 'Detroit rollout' },
};

export const NoChatsNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
