import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageTrackedLink } from './HomepageTrackedLink';

const meta = {
  title: 'Homepage/HomepageTrackedLink States',
  component: HomepageTrackedLink,
  parameters: { layout: 'centered' },
  args: {
    href: '/start',
    eventName: 'homepage_cta_clicked',
    children: 'Find your name',
  },
} satisfies Meta<typeof HomepageTrackedLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a label long enough to wrap inside a narrow column. */
export const LongContentWrappingLabel: Story = {
  args: {
    children:
      'Find your name, claim your profile and keep every release, link and fan signal in one place',
    eventProperties: { placement: 'footer' },
  },
  decorators: [
    Story => (
      <div className='max-w-60 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: an Arabic label in an Arabic document direction. */
export const RtlArabic: Story = {
  args: { children: 'ابحث عن اسمك' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='text-primary-token'>
        <Story />
      </div>
    ),
  ],
};
