import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NoOrphanText } from './NoOrphanText';

/** Rendered states of the line-break guard; the default lives in NoOrphanText.stories.tsx. */
const meta: Meta<typeof NoOrphanText> = {
  title: 'Marketing/Primitives/NoOrphanText States',
  component: NoOrphanText,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <h2 className='marketing-h2-linear max-w-sm text-balance text-primary-token'>
        <Story />
      </h2>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long headline whose final pair still stays together. */
export const LongContentHeadline: Story = {
  args: {
    children:
      'Every release, every profile and every fan signal in one place, kept in step with Smart Artist Collections',
  },
};

/** Right-to-left: an Arabic headline in an Arabic document direction. */
export const RtlArabic: Story = {
  args: { children: 'مصمم ليبقى بعيدًا عن طريقك تمامًا' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
