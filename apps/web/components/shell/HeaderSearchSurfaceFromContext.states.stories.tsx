import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurfaceFromContext } from './HeaderSearchSurfaceFromContext';

/** Rendered states of the sidebar search trigger beyond the default stories. */
const meta = {
  title: 'Shell/HeaderSearchSurfaceFromContext/States',
  component: HeaderSearchSurfaceFromContext,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HeaderSearchSurfaceFromContext>;

export default meta;
type Story = StoryObj<typeof meta>;

function SidebarFrame({
  children,
  dir,
}: Readonly<{ children: ReactNode; dir?: 'rtl' }>) {
  return (
    <HeaderActionsProvider>
      <TooltipProvider>
        <div dir={dir} className='w-40 bg-sidebar p-3'>
          {children}
        </div>
      </TooltipProvider>
    </HeaderActionsProvider>
  );
}

function withSidebarFrame(StoryFn: () => ReactNode) {
  return <SidebarFrame>{StoryFn()}</SidebarFrame>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <SidebarFrame dir='rtl'>{StoryFn()}</SidebarFrame>;
}

/** Partial: only defaults, so the plain rail row without calm or compact. */
export const PartialDefaultRow: Story = { decorators: [withSidebarFrame] };

/** Long content: the label truncates in a narrow rail. */
export const LongContentNarrowRail: Story = {
  args: { calm: true },
  decorators: [withSidebarFrame],
};

/** Rtl: the trigger mirrors in a right-to-left sidebar. */
export const RtlTrigger: Story = { decorators: [withRtlFrame] };
