import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TeleprompterNotchVisual } from './TeleprompterNotchVisual';

const meta = {
  title: 'Jovie/Components/TeleprompterNotchVisual',
  component: TeleprompterNotchVisual,
  parameters: {
    layout: 'centered',
  },
  args: {
    script:
      'Hold the camera at eye level, press record, and walk through the release.',
  },
  decorators: [
    Story => (
      <div className='w-64 bg-base p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TeleprompterNotchVisual>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// No script yet: the phone and the reading marker stand alone.
export const EmptyScript: Story = {
  args: {
    script: '',
  },
};

// A script past 120 characters is cut to a preview with an ellipsis.
export const LongContent: Story = {
  args: {
    script:
      'Hold the camera at eye level, press record, and walk through the release. Say where you wrote it, who played on it, what the cover means, when the vinyl ships and where fans can pre-save tonight.',
  },
};

export const Rtl: Story = {
  args: {
    script: 'أمسك الكاميرا على مستوى العين، اضغط تسجيل، ثم تحدّث عن الإصدار.',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
