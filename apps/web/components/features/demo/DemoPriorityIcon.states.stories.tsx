import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoPriorityIcon } from './DemoPriorityIcon';

/**
 * State coverage for the demo priority glyph. The full set stays in
 * DemoPriorityIcon.stories.tsx.
 */
const meta = {
  title: 'Features/Demo/DemoPriorityIcon States',
  component: DemoPriorityIcon,
  parameters: {
    layout: 'centered',
  },
  args: { priority: 'urgent' },
} satisfies Meta<typeof DemoPriorityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: every priority in a row inside an RTL document. */
export const RtlDocument: Story = {
  render: () => (
    <div dir='rtl' className='flex gap-3'>
      {(['urgent', 'high', 'medium', 'low', 'none'] as const).map(priority => (
        <DemoPriorityIcon key={priority} priority={priority} />
      ))}
    </div>
  ),
};
