import '../../../../styles/chat-file-upload.css';
import '../../../../styles/system-b-app.css';
import 'streamdown/styles.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatUiPlayground } from '@/app/app/(shell)/admin/chat-playground/ChatUiPlayground';

const meta = {
  title: 'Internal/ChatUiPlayground',
  component: ChatUiPlayground,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-screen bg-base p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatUiPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {};
