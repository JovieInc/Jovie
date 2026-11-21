import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { YouTubeCrossCategoryPrompt } from './YouTubeCrossCategoryPrompt';

const candidate: DetectedLink = {
  platform: {
    id: 'youtube',
    name: 'YouTube',
    category: 'social',
    icon: 'youtube',
    color: 'FF0000',
    placeholder: 'https://youtube.com/@artist',
  },
  normalizedUrl: 'https://youtube.com/@artist',
  originalUrl: 'https://youtube.com/@artist',
  suggestedTitle: 'YouTube',
  isValid: true,
};

const noop = () => undefined;

function WidthDecorator(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Dashboard/Links/YouTubeCrossCategoryPrompt',
  component: YouTubeCrossCategoryPrompt,
  parameters: { layout: 'centered' },
  decorators: [WidthDecorator],
  args: {
    candidate,
    target: 'dsp',
    onConfirm: noop,
    onCancel: noop,
    animate: false,
  },
} satisfies Meta<typeof YouTubeCrossCategoryPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: no candidate link, so nothing renders. */
export const EmptyNoCandidate: Story = {
  args: { candidate: null },
};

/** Long content: a long platform name wraps beside the actions. */
export const LongContentPlatformName: Story = {
  args: {
    candidate: {
      ...candidate,
      platform: {
        ...candidate.platform,
        name: 'YouTube channel with a very long display name that has to wrap',
      },
    },
  },
};

/** RTL: the prompt mirrors in a right-to-left document. */
export const RtlPrompt: Story = {
  args: { target: 'social' },
  decorators: [
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};

/** Partial: the platform has no display name, so the platform id is shown. */
export const PartialNoPlatformName: Story = {
  args: {
    candidate: {
      ...candidate,
      platform: { ...candidate.platform, name: '' },
    },
  },
};
