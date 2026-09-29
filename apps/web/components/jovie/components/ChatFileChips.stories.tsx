import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { PendingFile } from '../hooks/useChatFileAttachments';
import { ChatFileChips } from './ChatFileChips';

const files = [
  {
    id: 'f1',
    name: 'cover-art.png',
    size: 204800,
    mediaType: 'image/png',
    kind: 'image',
    progress: 100,
    speed: 0,
    status: 'ready',
    kindLabel: 'Image',
  },
  {
    id: 'f2',
    name: 'master.wav',
    size: 10485760,
    mediaType: 'audio/wav',
    kind: 'audio',
    progress: 100,
    speed: 0,
    status: 'ready',
    kindLabel: 'Audio',
  },
] as unknown as PendingFile[];

const meta = {
  title: 'Jovie/ChatFileChips',
  component: ChatFileChips,
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
    files,
    onRemove: fn(),
  },
} satisfies Meta<typeof ChatFileChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleFile: Story = {
  args: {
    files: files.slice(0, 1),
  },
};

export const Empty: Story = {
  args: {
    files: [],
  },
};
