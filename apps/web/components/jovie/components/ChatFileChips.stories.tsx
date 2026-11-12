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

const readyFile = (id: string, name: string, kind: PendingFile['kind']) =>
  ({
    id,
    name,
    size: 1_048_576,
    mediaType: 'application/octet-stream',
    kind,
    progress: 100,
    speed: 0,
    status: 'ready',
    kindLabel: 'File',
  }) as PendingFile;

/** Long file names truncate inside each chip and the row wraps. */
export const LongContentFileNames: Story = {
  args: {
    files: [
      readyFile(
        'long-1',
        'summer-festival-headline-set-final-master-v12-approved-by-label.wav',
        'audio'
      ),
      readyFile(
        'long-2',
        'press-kit-2026-photography-high-resolution-originals-batch-three.zip',
        'archive'
      ),
      readyFile(
        'long-3',
        'tour-rider-and-stage-plot-for-every-venue-on-the-autumn-run.pdf',
        'document'
      ),
    ],
  },
};

/** Right to left: chips follow the writing direction with Arabic file names. */
export const RtlFileNames: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  args: {
    files: [
      readyFile('rtl-1', 'الأغنية-النهائية-للمهرجان.wav', 'audio'),
      readyFile('rtl-2', 'صور-الجولة-الصيفية.zip', 'archive'),
    ],
  },
};
