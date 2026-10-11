import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentSectionHeaderSkeleton } from './ContentSectionHeaderSkeleton';

const meta = {
  title: 'Molecules/ContentSectionHeaderSkeleton',
  component: ContentSectionHeaderSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-3xl bg-surface-0'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContentSectionHeaderSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithActions: Story = {
  args: {
    actionWidths: ['w-20', 'w-24'],
  },
};

export const CustomWidths: Story = {
  args: {
    titleWidth: 'w-24',
    descriptionWidth: 'w-40',
    actionWidths: ['w-16'],
  },
};
