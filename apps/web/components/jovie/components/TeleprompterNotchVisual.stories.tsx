import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TeleprompterNotchVisual } from './TeleprompterNotchVisual';

const meta = {
  title: 'Jovie/TeleprompterNotchVisual',
  component: TeleprompterNotchVisual,
  parameters: {
    layout: 'centered',
  },
  args: {
    script: 'Hey, it is Tim. New single out Friday. Pre-save it now.',
  },
  decorators: [
    Story => (
      <div className='w-55'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TeleprompterNotchVisual>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyScript: Story = {
  args: {
    script: '',
  },
};

export const LongContentScript: Story = {
  args: {
    script:
      'Hey, it is Tim. I have been in the studio for six months on this one and I cannot wait for you to hear it. The new single is out Friday everywhere you listen.',
  },
};

export const RtlOverflowScript: Story = {
  args: {
    script:
      'مرحبا، أغنيتي الجديدة تصدر يوم الجمعة على جميع المنصات. احفظها مسبقا الآن حتى لا تفوتك.',
  },
  decorators: [
    Story => (
      <div dir='rtl' className='w-55'>
        <Story />
      </div>
    ),
  ],
};
