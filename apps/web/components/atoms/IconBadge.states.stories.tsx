import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IconBadge } from './IconBadge';

/** Rendered states of the tinted icon badge, beside IconBadge.stories.tsx. */
const meta = {
  title: 'Atoms/IconBadge States',
  component: IconBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'Music',
    colorVar: '--color-accent',
  },
} satisfies Meta<typeof IconBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no accessible label, so the glyph is decorative beside its text. */
export const PartialDecorativeBesideText: Story = {
  render: args => (
    <div className='flex items-center gap-2 text-sm text-primary-token'>
      <IconBadge {...args} />
      <span>Music</span>
    </div>
  ),
};

/** Long content: a long accessible label on a standalone badge. */
export const LongContentLabel: Story = {
  args: {
    name: 'Bell',
    colorVar: '--color-warning',
    ariaLabel:
      'Three new notifications about release links, playlist pitches and fan messages',
  },
};

/** Right-to-left: a labelled badge on an Arabic page. */
export const RtlArabicLabel: Story = {
  args: {
    name: 'Bell',
    colorVar: '--color-warning',
    ariaLabel: 'إشعار',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
