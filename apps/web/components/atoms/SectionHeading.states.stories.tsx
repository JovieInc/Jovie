import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SectionHeading } from './SectionHeading';

/** Rendered states of the section heading, beside SectionHeading.stories.tsx. */
const meta = {
  title: 'Atoms/SectionHeading States',
  component: SectionHeading,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Featured Artists',
  },
} satisfies Meta<typeof SectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only the text, so level, size and alignment take their defaults. */
export const PartialDefaults: Story = {};

/** Long content: a long heading wraps inside a narrow column. */
export const LongContentHeading: Story = {
  args: {
    level: 3,
    size: 'md',
    align: 'left',
    children:
      'Every release, every playlist pitch and every fan message in one workspace',
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: an Arabic heading aligned to the reading start. */
export const RtlArabicHeading: Story = {
  args: {
    align: 'right',
    children: 'فنانون مميزون',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-72'>
        <Story />
      </div>
    ),
  ],
};
