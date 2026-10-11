import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TableErrorFallback } from './TableErrorFallback';

const meta = {
  title: 'Atoms/TableErrorFallback',
  component: TableErrorFallback,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    error: Object.assign(new Error('The releases table failed to load.'), {
      digest: 'releases-table-error',
    }),
    resetErrorBoundary: fn(),
  },
  decorators: [
    Story => (
      <div className='flex min-h-64 items-center justify-center rounded-md border border-subtle'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TableErrorFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoMessage: Story = {
  name: 'Fallback message (empty error message)',
  args: {
    error: Object.assign(new Error(''), { digest: 'releases-table-empty' }),
  },
};
