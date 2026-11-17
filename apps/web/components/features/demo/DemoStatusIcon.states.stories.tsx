import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoStatusIcon } from './DemoStatusIcon';

/**
 * State coverage for the demo release status glyph. The full set stays in
 * DemoStatusIcon.stories.tsx.
 */
const meta = {
  title: 'Features/Demo/DemoStatusIcon States',
  component: DemoStatusIcon,
  parameters: {
    layout: 'centered',
  },
  args: { status: 'live' },
} satisfies Meta<typeof DemoStatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: every status in a row inside an RTL document. */
export const RtlDocument: Story = {
  render: () => (
    <div dir='rtl' className='flex gap-3'>
      {(['live', 'syncing', 'scheduled', 'draft', 'archived'] as const).map(
        status => (
          <DemoStatusIcon key={status} status={status} />
        )
      )}
    </div>
  ),
};
