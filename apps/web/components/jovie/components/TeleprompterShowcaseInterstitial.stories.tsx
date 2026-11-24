import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TeleprompterShowcaseInterstitial } from './TeleprompterShowcaseInterstitial';

const longTitle =
  'Release Promo — Extended Single Drop With Pre-Save Campaign And Fan Capture Follow-Up';
const longScript =
  'Hey, it is me. My new single drops Friday — tap the link in my bio to pre-save it now. Tell a friend, share the story, and come back Friday night for the premiere livestream where I walk through the writing process.';
const rtlTitle = 'إصدار ترويجي — تسجيل بنص المتابعة';
const rtlScript =
  'مرحباً، أنا هنا. أغنيتي الجديدة تصدر يوم الجمعة — اضغط الرابط في سيرتي لحفظها مسبقاً الآن.';

const meta = {
  title: 'Jovie/Components/TeleprompterShowcaseInterstitial',
  component: TeleprompterShowcaseInterstitial,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  args: {
    open: true,
    onOpenChange: fn(),
    onStartRecording: fn(),
    profileId: 'profile-story',
    kind: 'promo',
    title: 'Release Promo',
    script:
      'Hey, it is me. My new single drops Friday — tap the link in my bio to pre-save it now.',
    showcaseVariant: 'interstitial',
  },
} satisfies Meta<typeof TeleprompterShowcaseInterstitial>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: { open: false },
};

export const LongContentTitleAndScript: Story = {
  args: {
    title: longTitle,
    script: longScript,
  },
};

export const RtlOverflowTitleAndScript: Story = {
  args: {
    title: rtlTitle,
    script: rtlScript,
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
