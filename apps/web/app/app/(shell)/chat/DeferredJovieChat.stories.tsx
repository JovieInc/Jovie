import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatLoadingBody } from './ChatLoadingState';
import { JovieChat } from './DeferredJovieChat';

const meta = {
  title: 'App/Chat/DeferredJovieChat',
  component: JovieChat,
  parameters: { layout: 'fullscreen' },
  args: { ambientOwnedByShell: true },
  decorators: [
    Story => (
      <div className='relative h-160 overflow-hidden bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof JovieChat>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Once the chat chunk loads, the deferred chat is the regular JovieChat. */
export const Mounted: Story = {};

/** What a client navigation shows while the chat chunk is still loading. */
export const LoadingChunk: Story = {
  render: () => <ChatLoadingBody />,
};
