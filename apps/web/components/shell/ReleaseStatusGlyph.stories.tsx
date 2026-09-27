import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseStatusGlyph } from './ReleaseStatusGlyph';

const meta: Meta<typeof ReleaseStatusGlyph> = {
  title: 'Shell/ReleaseStatusGlyph',
  component: ReleaseStatusGlyph,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      {(['live', 'scheduled', 'announced', 'draft', 'hidden'] as const).map(
        status => (
          <ReleaseStatusGlyph key={status} status={status} />
        )
      )}
    </div>
  ),
};
