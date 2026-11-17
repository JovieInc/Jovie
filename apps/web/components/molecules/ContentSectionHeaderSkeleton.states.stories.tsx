import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentSectionHeaderSkeleton } from './ContentSectionHeaderSkeleton';

/** Rendered states of the section header skeleton, beside ContentSectionHeaderSkeleton.stories.tsx. */
const meta = {
  title: 'Molecules/ContentSectionHeaderSkeleton States',
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

/** Empty: an empty action list paints only the title and description lines. */
export const EmptyActions: Story = {
  args: {
    actionWidths: [],
  },
};
