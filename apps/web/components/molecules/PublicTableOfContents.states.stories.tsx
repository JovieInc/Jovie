import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicTableOfContents } from './PublicTableOfContents';

const meta = {
  title: 'Molecules/PublicTableOfContents/States',
  component: PublicTableOfContents,
  parameters: { layout: 'centered' },
  decorators: [
    function TocFrame(Story) {
      return (
        <div className='w-64'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof PublicTableOfContents>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a single heading with no nested levels. */
export const PartialSingleHeading: Story = {
  args: { toc: [{ id: 'intro', title: 'Introduction', level: 2 }] },
};

/** Long content: long headings wrap and nested levels indent. */
export const LongContentNested: Story = {
  args: {
    toc: [
      {
        id: 'a',
        title: 'How we collect, store and share information about your account',
        level: 2,
      },
      { id: 'b', title: 'Information you give us directly', level: 3 },
      {
        id: 'c',
        title: 'Information collected automatically when you use the service',
        level: 3,
      },
    ],
  },
};

/** Rtl: the contents mirror in a right-to-left layout. */
export const RtlHeadings: Story = {
  args: {
    toc: [
      { id: 'a', title: 'مقدمة', level: 2 },
      { id: 'b', title: 'البيانات التي نجمعها', level: 3 },
    ],
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-64'>
          <Story />
        </div>
      );
    },
  ],
};
