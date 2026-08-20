import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ChatLoading from './ChatLoadingState';

const meta = {
  title: 'App/Chat/Loading',
  component: ChatLoading,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='relative h-[40rem] overflow-hidden bg-base'>
      <ChatLoading />
    </div>
  ),
} satisfies Meta<typeof ChatLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
