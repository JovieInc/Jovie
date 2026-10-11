import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatArtifactErrorCard } from './ChatArtifactErrorCard';

const meta = {
  title: 'Jovie/ChatArtifactErrorCard',
  component: ChatArtifactErrorCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: "Couldn't generate cover art",
    message: 'Something went wrong on our end.',
  },
} satisfies Meta<typeof ChatArtifactErrorCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutRetry: Story = {
  args: {
    showRetry: false,
  },
};

export const CustomRetryPrompt: Story = {
  args: {
    retryPrompt: 'Try generating the cover art again',
  },
};
