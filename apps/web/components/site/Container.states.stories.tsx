import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Container } from './Container';

const LONG_TOKEN =
  'https://jov.ie/a-very-long-unbroken-profile-address-that-tests-overflow-inside-the-public-container';

const meta = {
  title: 'Site/Container States',
  component: Container,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithPageSurface(Story) {
      return (
        <div className='bg-base py-8 text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
  args: { children: null },
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the boxed width with a single short line and no other content. */
export const PartialSingleLine: Story = {
  args: {
    children: <p className='text-secondary-token'>Public content</p>,
  },
};

/** Long content: long prose and an unbroken address wrap inside the box. */
export const LongContentProse: Story = {
  args: {
    children: (
      <div className='space-y-4 text-secondary-token'>
        <p>
          The public container keeps every page on one boxed width with the
          shared gutter, so long paragraphs wrap at the same measure on every
          marketing page, blog post and legal page, at every breakpoint.
        </p>
        <p className='break-words'>{LONG_TOKEN}</p>
      </div>
    ),
  },
};

/** Right-to-left: Arabic copy in the full-bleed override. */
export const RtlArabicBleed: Story = {
  args: {
    size: 'bleed',
    children: <p className='text-secondary-token'>محتوى عام بعرض كامل.</p>,
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
