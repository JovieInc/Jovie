import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LibraryLoadingState } from './LibraryLoadingState';

const meta = {
  title: 'App/Library/Loading',
  component: LibraryLoadingState,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='relative flex h-160 w-full overflow-hidden bg-base'>
      <LibraryLoadingState />
    </div>
  ),
} satisfies Meta<typeof LibraryLoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First-boot fallback for /app/library at full width: every column fits. */
export const LoadingCatalog: Story = {};

/** A narrow pane drops low-priority columns from header and rows alike. */
export const LoadingNarrowPane: Story = {
  render: () => (
    <div className='relative flex h-160 w-120 overflow-hidden bg-base'>
      <LibraryLoadingState />
    </div>
  ),
};

/** In a right-to-left document the toolbar chips and columns mirror. */
export const RtlMirrored: Story = {
  render: () => (
    <div
      dir='rtl'
      lang='ar'
      className='relative flex h-160 w-full overflow-hidden bg-base'
    >
      <LibraryLoadingState />
    </div>
  ),
};
