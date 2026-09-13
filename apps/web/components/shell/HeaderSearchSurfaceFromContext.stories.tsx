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
const meta = {
  title: 'Shell/HeaderSearchSurfaceFromContext',
  component: HeaderSearchSurfaceFromContext,
  decorators: [
    Story => (
      <HeaderActionsProvider>
        <div className='flex items-center gap-3 p-4'>
          <Story />
          <SearchState />
        </div>
      </HeaderActionsProvider>
    ),
  ],
} satisfies Meta<typeof HeaderSearchSurfaceFromContext>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Row: Story = {};
export const Compact: Story = { args: { compact: true } };
