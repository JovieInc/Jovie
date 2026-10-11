import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatMarkdown } from './ChatMarkdown';

const meta = {
  title: 'Jovie/ChatMarkdown',
  component: ChatMarkdown,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    content:
      "Here's what I found for your release:\n\n- **Midnight Drive**: single, live now\n- 6 DSPs connected",
  },
} satisfies Meta<typeof ChatMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Streaming: Story = {
  args: {
    isStreaming: true,
    content: "Here's what I fou",
  },
};

export const Inline: Story = {
  args: {
    inline: true,
    content: 'a **quick** inline note',
  },
};
