import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DocPrintScope } from './DocPrintScope';

const meta = {
  title: 'Molecules/DocPrintScope',
  component: DocPrintScope,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 space-y-2 rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-secondary-token'>
        <p className='font-medium text-primary-token'>Print scope active</p>
        <p>
          Mounting <code>DocPrintScope</code> sets{' '}
          <code>
            document.documentElement.dataset.docPage = &quot;true&quot;
          </code>{' '}
          for the lifetime of the doc route, then removes it on unmount.
        </p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DocPrintScope>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
