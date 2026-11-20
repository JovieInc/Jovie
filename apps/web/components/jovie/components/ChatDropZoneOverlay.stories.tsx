import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CSSProperties } from 'react';
import type { PendingFile } from '../hooks/useChatFileAttachments';
import { ChatDropZoneOverlay } from './ChatDropZoneOverlay';

const pendingFiles: PendingFile[] = [
  {
    id: 'story-audio',
    name: 'rough-mix.wav',
    size: 48_600_000,
    mediaType: 'audio/wav',
    kind: 'audio',
    progress: 0,
    speed: 0,
    status: 'queued',
    kindLabel: 'Audio',
  },
  {
    id: 'story-artwork',
    name: 'cover-art.png',
    size: 3_200_000,
    mediaType: 'image/png',
    kind: 'image',
    progress: 0,
    speed: 0,
    status: 'queued',
    kindLabel: 'Image',
  },
];

const workspaceStyle: CSSProperties & {
  '--system-b-chat-composer-thread-scroll-padding': string;
} = {
  '--system-b-chat-composer-thread-scroll-padding': '104px',
  position: 'relative',
  width: 'min(720px, calc(100vw - 32px))',
  height: '420px',
  overflow: 'hidden',
  borderRadius: '8px',
  border: '1px solid var(--system-b-border-subtle, rgba(255,255,255,0.12))',
  background: 'var(--system-b-bg-elevated, #121216)',
};

const composerStyle: CSSProperties = {
  position: 'absolute',
  right: '24px',
  bottom: '24px',
  left: '24px',
  height: '56px',
  borderRadius: '8px',
  border: '1px solid var(--system-b-border-subtle, rgba(255,255,255,0.12))',
  background: 'var(--system-b-bg, #19191f)',
};

const meta = {
  title: 'Jovie/Components/ChatDropZoneOverlay',
  component: ChatDropZoneOverlay,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={workspaceStyle}>
        <Story />
        <div aria-hidden='true' style={composerStyle} />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatDropZoneOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isDragOver: true,
    pendingFiles,
  },
};

export const EmptyDrag: Story = {
  args: {
    isDragOver: true,
    pendingFiles: [],
  },
};

const manyFiles: PendingFile[] = [
  ...pendingFiles,
  ...Array.from({ length: 18 }, (_, index): PendingFile => {
    const kind = (['audio', 'video', 'document', 'archive'] as const)[
      index % 4
    ];
    return {
      id: `story-many-${index}`,
      name: `session-take-${index + 1}-with-a-long-descriptive-file-name.${kind}`,
      size: 180_000_000 + index * 7_500_000,
      mediaType: 'application/octet-stream',
      kind,
      progress: 0,
      speed: 0,
      status: 'queued',
      kindLabel: kind,
    };
  }),
];

/** Twenty files across every kind: the summary and badges wrap, never clip. */
export const ManyFileKinds: Story = {
  args: {
    isDragOver: true,
    pendingFiles: manyFiles,
  },
};

export const RtlDrag: Story = {
  args: {
    isDragOver: true,
    pendingFiles,
  },
  decorators: [
    Story => (
      <div dir='rtl' className='h-full w-full'>
        <Story />
      </div>
    ),
  ],
};
