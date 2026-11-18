import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoClientProviders } from './DemoClientProviders';

/**
 * State coverage for the demo provider stack. The canonical story stays in
 * DemoClientProviders.stories.tsx; these change only the wrapped content or
 * the document direction.
 */
const meta = {
  title: 'Features/Demo/DemoClientProviders States',
  component: DemoClientProviders,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DemoClientProviders>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: wrapped content long enough to wrap several lines. */
export const LongContentChildren: Story = {
  args: {
    children: (
      <div className='max-w-sm rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        The demo runs without an account: queries never refetch, tooltips work,
        URL state is kept in the address bar, and every screen reads the same
        frozen fixtures so a recording looks the same on every take.
      </div>
    ),
  },
};

/** Right-to-left: wrapped content inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    children: (
      <div
        dir='rtl'
        className='rounded-lg border border-subtle p-4 text-sm text-primary-token'
      >
        محتوى العرض التجريبي
      </div>
    ),
  },
};
