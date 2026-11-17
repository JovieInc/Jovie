import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ReleaseScheduleFields } from './ReleaseScheduleFields';

function withRtlCard(Story: () => ReactNode) {
  return (
    <div
      dir='rtl'
      lang='ar'
      className='w-full max-w-sm rounded-2xl border border-subtle bg-surface-1 p-6'
    >
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Release/ReleaseScheduleFields States',
  component: ReleaseScheduleFields,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ReleaseScheduleFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** RTL: the release and reveal date fields in a right-to-left form. */
export const RtlForm: Story = {
  decorators: [withRtlCard],
};
