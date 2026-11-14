import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TruncatedText } from './TruncatedText';

const meta = {
  title: 'Atoms/TruncatedText',
  component: TruncatedText,
  parameters: {
    layout: 'centered',
  },
  args: {
    children:
      'This is a very long title that will be truncated inside a narrow container',
  },
  decorators: [
    Story => (
      <div className='w-48'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TruncatedText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleLine: Story = {};

export const TwoLines: Story = {
  args: {
    lines: 2,
    children:
      'This is a longer description that spans multiple lines before the tooltip takes over and shows the full text on hover',
  },
};

export const NotTruncated: Story = {
  args: {
    children: 'Short title',
  },
};

export const AlwaysShowTooltip: Story = {
  args: {
    children: 'Short title',
    alwaysShowTooltip: true,
  },
};

/** A caller with no value yet passes an empty string: nothing renders. */
export const EmptyText: Story = {
  args: {
    children: '',
  },
};

/** Only the text and a forwarded title: no tooltip placement props. */
export const PartialTitleOnly: Story = {
  args: {
    children: 'A, B and 3 more',
    title: 'A, B, C, D and E',
  },
};

export const LongContentTitle: Story = {
  args: {
    children:
      'The Extraordinarily Long Album Title That Keeps Going Well Past Any Reasonable Line Length (Deluxe Anniversary Remastered Edition)',
  },
};

export const RtlTitle: Story = {
  args: {
    children:
      'عنوان ألبوم طويل جدا يستمر إلى ما بعد عرض الحاوية (إصدار الذكرى الموسع)',
    tooltipAlign: 'end',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
