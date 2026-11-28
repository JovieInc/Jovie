import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { AudienceQuickActionsCell } from './AudienceQuickActionsCell';

/** Rendered states of the quick actions cell. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceQuickActionsCell/States',
  component: AudienceQuickActionsCell,
  parameters: { layout: 'centered' },
  args: { onExport: fn(), onBlock: fn() },
} satisfies Meta<typeof AudienceQuickActionsCell>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlRow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div dir='rtl' className='group w-32 bg-surface-0 p-2'>
      {children}
    </div>
  );
}

function withRtlRow(StoryFn: () => ReactNode) {
  return <RtlRow>{StoryFn()}</RtlRow>;
}

/** Rtl: the actions mirror in a right-to-left row (revealed on row hover). */
export const RtlActions: Story = { decorators: [withRtlRow] };
