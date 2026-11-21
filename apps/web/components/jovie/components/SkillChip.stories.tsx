import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SkillChip } from './SkillChip';

const meta = {
  title: 'Jovie/Components/SkillChip',
  component: SkillChip,
  parameters: { layout: 'centered' },
  decorators: [
    function SkillChipFrame(Story) {
      return (
        <div className='w-full max-w-xs'>
          <Story />
        </div>
      );
    },
  ],
  args: { label: 'Release plan', onRemove: fn() },
} satisfies Meta<typeof SkillChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a read-only chip with no remove affordance. */
export const PartialReadOnly: Story = { args: { onRemove: undefined } };

/** Long content: a label past the chip width truncates. */
export const LongContentTruncated: Story = {
  args: {
    label:
      'Plan the full release rollout, pitch every playlist and schedule the announcement',
  },
};

/** Rtl: a right-to-left label keeps the remove button at the inline end. */
export const RtlLabel: Story = {
  args: { label: 'خطة الإصدار' },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
