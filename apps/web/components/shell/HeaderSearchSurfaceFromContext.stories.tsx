import type { Meta, StoryObj } from '@storybook/nextjs-vite';
<<<<<<< HEAD
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurfaceFromContext } from './HeaderSearchSurfaceFromContext';

const meta: Meta<typeof HeaderSearchSurfaceFromContext> = {
  title: 'Shell/HeaderSearchSurfaceFromContext',
  component: HeaderSearchSurfaceFromContext,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <HeaderActionsProvider>
        <div className='w-64 bg-sidebar p-3'>
          <Story />
=======
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
const meta = {
  title: 'Shell/HeaderSearchSurfaceFromContext',
  component: HeaderSearchSurfaceFromContext,
  decorators: [
    Story => (
      <HeaderActionsProvider>
        <div className='flex items-center gap-3 p-4'>
          <Story />
          <SearchState />
>>>>>>> e673466fd (test(shell): connect sidebar interaction evidence)
        </div>
      </HeaderActionsProvider>
    ),
  ],
<<<<<<< HEAD
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
=======
} satisfies Meta<typeof HeaderSearchSurfaceFromContext>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Row: Story = {};
export const Compact: Story = { args: { compact: true } };
>>>>>>> e673466fd (test(shell): connect sidebar interaction evidence)
