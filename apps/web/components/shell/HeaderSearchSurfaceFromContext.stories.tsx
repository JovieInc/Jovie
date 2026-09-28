import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurfaceFromContext } from './HeaderSearchSurfaceFromContext';

function SearchState() {
  const { isCommandPaletteOpen } = useHeaderActions();
  return (
    <output>{isCommandPaletteOpen ? 'Search open' : 'Search closed'}</output>
  );
}

const meta: Meta<typeof HeaderSearchSurfaceFromContext> = {
  title: 'Shell/HeaderSearchSurfaceFromContext',
  component: HeaderSearchSurfaceFromContext,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <HeaderActionsProvider>
        <div className='w-64 bg-sidebar p-3'>
          <Story />
          <SearchState />
        </div>
      </HeaderActionsProvider>
    ),
  ],
  args: {
    calm: true,
  },
};

export default meta;
type Story = StoryObj<typeof HeaderSearchSurfaceFromContext>;

export const Calm: Story = {};

export const Default: Story = {
  args: {
    calm: false,
  },
};

export const Row: Story = {
  args: {
    calm: false,
  },
};

export const Compact: Story = {
  args: {
    calm: false,
    compact: true,
  },
};
