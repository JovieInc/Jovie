import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MatchStatusBadge } from './MatchStatusBadge';

/**
 * State coverage for MatchStatusBadge. Labels come from the fixed match
 * status contract, so the only state a caller can change is the direction of
 * the surrounding document.
 */
const meta = {
  title: 'Dashboard/Atoms/MatchStatusBadge States',
  component: MatchStatusBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    status: 'suggested',
  },
} satisfies Meta<typeof MatchStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: every status, at both sizes, beside RTL copy. */
export const RtlDocument: Story = {
  render: () => (
    <div dir='rtl' className='flex flex-col items-start gap-2'>
      <div className='flex items-center gap-2'>
        <span>حالة المطابقة</span>
        <MatchStatusBadge status='suggested' />
        <MatchStatusBadge status='confirmed' />
        <MatchStatusBadge status='auto_confirmed' />
        <MatchStatusBadge status='rejected' />
      </div>
      <div className='flex items-center gap-2'>
        <MatchStatusBadge status='suggested' size='sm' />
        <MatchStatusBadge status='auto_confirmed' size='sm' />
      </div>
    </div>
  ),
};
