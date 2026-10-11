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
