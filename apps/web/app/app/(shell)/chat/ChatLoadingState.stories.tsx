import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ChatLoading from './ChatLoadingState';

const meta = {
  title: 'App/Chat/Loading',
  component: ChatLoading,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='relative h-160 overflow-hidden bg-base'>
      <ChatLoading />
    </div>
  ),
} satisfies Meta<typeof ChatLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingDesktop: Story = {};

export const LoadingNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/** In a right-to-left document the greeting line and composer stubs mirror. */
export const RtlMirrored: Story = {
  render: () => (
    <div dir='rtl' lang='ar' className='relative h-160 overflow-hidden bg-base'>
      <ChatLoading />
    </div>
  ),
};
