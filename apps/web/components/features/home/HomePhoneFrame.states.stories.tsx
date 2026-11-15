import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomePhoneFrame } from './HomePhoneFrame';

const meta = {
  title: 'Features/Home/HomePhoneFrame States',
  component: HomePhoneFrame,
  parameters: { layout: 'centered' },
  args: { children: null },
} satisfies Meta<typeof HomePhoneFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the frame keeps its size with no screen content yet. */
export const Empty: Story = {};

/** Partial: only a heading has loaded into the screen. */
export const Partial: Story = {
  args: {
    compact: true,
    children: (
      <div className='flex h-full items-start p-4 text-sm text-primary-token'>
        Tim White
      </div>
    ),
  },
};

const LONG_PARAGRAPH_IDS = [
  'p1',
  'p2',
  'p3',
  'p4',
  'p5',
  'p6',
  'p7',
  'p8',
] as const;

/** Long content: copy that runs past the visible screen. */
export const LongContent: Story = {
  args: {
    children: (
      <div className='space-y-3 p-4 text-sm text-primary-token'>
        {LONG_PARAGRAPH_IDS.map(id => (
          <p key={id}>
            A release page with listen links for every service, a presave
            countdown, tour dates near the fan and a tip jar, all in one
            scrolling profile.
          </p>
        ))}
      </div>
    ),
  },
};

/** Rtl: Arabic screen content in a right-to-left document. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    children: (
      <div className='p-4 text-sm text-primary-token'>
        صفحة الإصدار مع روابط الاستماع لكل خدمة وتواريخ الجولة القريبة
      </div>
    ),
  },
};
