import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CSSProperties } from 'react';
import {
  LocalCheckoutApi,
  UpgradeQueryProvider,
} from '@/tests/fixtures/upgrade-checkout-story';
import type { PendingFile } from '../hooks/useChatFileAttachments';
import { ChatUploadManifest } from './ChatUploadManifest';

const noop = () => {};

const uploadingFile: PendingFile = {
  id: 'story-uploading-audio',
  name: 'festival-master.wav',
  size: 48_600_000,
  mediaType: 'audio/wav',
  kind: 'audio',
  progress: 73,
  speed: 1_200_000,
  status: 'uploading',
  kindLabel: 'Audio',
};

const processingFile: PendingFile = {
  id: 'story-processing-stems',
  name: 'stems.zip',
  size: 126_400_000,
  mediaType: 'application/zip',
  kind: 'document',
  progress: 100,
  speed: 0,
  status: 'processing',
  kindLabel: 'Archive',
};

const readyFile: PendingFile = {
  id: 'story-ready-artwork',
  name: 'cover-art.png',
  size: 3_200_000,
  mediaType: 'image/png',
  kind: 'image',
  progress: 100,
  speed: 0,
  status: 'ready',
  kindLabel: 'Image',
};

const failedFile: PendingFile = {
  id: 'story-failed-video',
  name: 'behind-the-scenes.mov',
  size: 212_000_000,
  mediaType: 'video/quicktime',
  kind: 'video',
  progress: 42,
  speed: 0,
  status: 'failed',
  error: 'Upload failed. Try again.',
  kindLabel: 'Video',
};

const duplicateFile: PendingFile = {
  id: 'story-duplicate-audio',
  name: 'festival-master-copy.wav',
  size: 48_600_000,
  mediaType: 'audio/wav',
  kind: 'audio',
  progress: 0,
  speed: 0,
  status: 'duplicate',
  kindLabel: 'Audio',
};

const shellStyle: CSSProperties = {
  width: 'min(520px, calc(100vw - 32px))',
};

const meta = {
  title: 'Jovie/Components/ChatUploadManifest',
  component: ChatUploadManifest,
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/app' } },
    layout: 'centered',
  },
  decorators: [
    Story => (
      <UpgradeQueryProvider>
        <LocalCheckoutApi reply='server-error'>
          <Story />
        </LocalCheckoutApi>
      </UpgradeQueryProvider>
    ),
    Story => (
      <div style={shellStyle}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatUploadManifest>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Uploading: Story = {
  args: {
    files: [uploadingFile, processingFile, readyFile],
    aggregate: {
      total: 3,
      done: 1,
      overallPct: 58,
      speed: '1.2 MB/s',
      eta: '12s',
    },
    isUploading: true,
    onRemove: noop,
    onCollapse: noop,
  },
};

export const Collapsed: Story = {
  args: {
    files: [uploadingFile, readyFile],
    aggregate: {
      total: 2,
      done: 1,
      overallPct: 50,
      speed: '1.2 MB/s',
      eta: '12s',
    },
    isUploading: true,
    onRemove: noop,
    collapsed: true,
    onExpand: noop,
  },
};

export const ErrorAndDuplicate: Story = {
  args: {
    files: [failedFile, duplicateFile, readyFile],
    aggregate: {
      total: 3,
      done: 1,
      overallPct: 33,
      speed: '0 B/s',
      eta: 'Retry needed',
    },
    isUploading: false,
    onRemove: noop,
  },
};

export const LockedQuota: Story = {
  args: {
    files: [uploadingFile, readyFile],
    aggregate: {
      total: 2,
      done: 1,
      overallPct: 50,
      speed: '1.2 MB/s',
      eta: '12s',
    },
    isUploading: true,
    onRemove: noop,
    lockedCount: 2,
    isPro: false,
  },
};

/** Nothing attached: the manifest takes no space. */
export const EmptyNoFiles: Story = {
  args: {
    files: [],
    aggregate: { total: 0, done: 0, overallPct: 0, speed: '0 B/s', eta: '—' },
    isUploading: false,
    onRemove: noop,
  },
};

const queuedFile: PendingFile = {
  ...uploadingFile,
  id: 'story-queued-stems',
  name: 'vocal-stems.wav',
  progress: 0,
  speed: 0,
  status: 'queued',
};

/** Speed and ETA are not measured yet, and no collapse control is offered. */
export const PartialUnmeasuredSpeed: Story = {
  args: {
    files: [queuedFile, readyFile],
    aggregate: {
      total: 2,
      done: 1,
      overallPct: 50,
      speed: '—',
      eta: 'Calculating',
    },
    isUploading: true,
    onRemove: noop,
  },
};

const longNames = [
  'summer-festival-headline-set-final-master-v12-approved-by-label.wav',
  'press-kit-2026-photography-high-resolution-originals-batch-three.zip',
  'tour-rider-and-stage-plot-for-every-venue-on-the-autumn-run.pdf',
  'behind-the-scenes-documentary-rough-cut-with-director-notes.mov',
  'remix-contest-submission-pack-with-stems-and-license-terms.zip',
  'artwork-alternate-square-crop-for-streaming-store-banners.png',
];

/** Many long file names: rows truncate and the list scrolls. */
export const LongContentManyFiles: Story = {
  args: {
    files: longNames.map((name, index) => ({
      ...(index % 2 === 0 ? uploadingFile : readyFile),
      id: `story-long-${index}`,
      name,
    })),
    aggregate: {
      total: longNames.length,
      done: 3,
      overallPct: 61,
      speed: '2.4 MB/s',
      eta: '1 min 20s',
    },
    isUploading: true,
    onRemove: noop,
    onCollapse: noop,
  },
};

/** Right to left: rows and progress follow the writing direction. */
export const RtlArabicFileNames: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  args: {
    files: [
      { ...uploadingFile, name: 'الأغنية-النهائية-للمهرجان.wav' },
      { ...readyFile, name: 'غلاف-الألبوم.png' },
    ],
    aggregate: {
      total: 2,
      done: 1,
      overallPct: 50,
      speed: '1.2 MB/s',
      eta: '12s',
    },
    isUploading: true,
    onRemove: noop,
    onCollapse: noop,
  },
};
