import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProviderStatusGlyph } from './ProviderStatusGlyph';

const meta: Meta<typeof ProviderStatusGlyph> = {
  title: 'Dashboard/Releases/ProviderStatusGlyph',
  component: ProviderStatusGlyph,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <ProviderStatusGlyph status='available' />
      <ProviderStatusGlyph status='manual' />
      <ProviderStatusGlyph status='missing' />
    </div>
  ),
};
