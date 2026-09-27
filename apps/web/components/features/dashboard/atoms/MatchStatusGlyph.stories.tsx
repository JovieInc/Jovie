import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MatchStatusGlyph } from './MatchStatusGlyph';

const meta: Meta<typeof MatchStatusGlyph> = {
  title: 'Dashboard/Atoms/MatchStatusGlyph',
  component: MatchStatusGlyph,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      {(['suggested', 'confirmed', 'auto_confirmed', 'rejected'] as const).map(
        status => (
          <MatchStatusGlyph key={status} status={status} />
        )
      )}
    </div>
  ),
};
