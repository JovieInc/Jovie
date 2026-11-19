import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceIntentBadge } from './AudienceIntentBadge';

/**
 * State coverage for AudienceIntentBadge. The label comes from the fixed
 * intent contract, so the only state a caller can change is the direction of
 * the surrounding document.
 */
const meta = {
  title: 'Dashboard/Atoms/AudienceIntentBadge States',
  component: AudienceIntentBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    intentLevel: 'high',
  },
} satisfies Meta<typeof AudienceIntentBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: every intent level beside RTL copy. */
export const RtlDocument: Story = {
  render: () => (
    <div dir='rtl' className='flex items-center gap-2'>
      <span>مستوى الاهتمام</span>
      <AudienceIntentBadge intentLevel='high' />
      <AudienceIntentBadge intentLevel='medium' />
      <AudienceIntentBadge intentLevel='low' />
    </div>
  ),
};
