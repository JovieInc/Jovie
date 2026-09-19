import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NormalizedTrustLogo } from './NormalizedTrustLogo';

const meta = {
  title: 'Media/NormalizedTrustLogo',
  component: NormalizedTrustLogo,
  parameters: { layout: 'centered' },
  args: { id: 'umg' },
} satisfies Meta<typeof NormalizedTrustLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UniversalMusicGroup: Story = {
  render: args => (
    <div className='w-32 text-primary-token'>
      <NormalizedTrustLogo {...args} />
    </div>
  ),
};

export const Armada: Story = {
  args: { id: 'armada' },
  render: args => (
    <div className='w-32 text-primary-token'>
      <NormalizedTrustLogo {...args} />
    </div>
  ),
};

export const AdjacentNarrowSlots: Story = {
  render: args => (
    <div className='flex items-center gap-6 text-primary-token'>
      <div className='w-16'>
        <NormalizedTrustLogo {...args} />
      </div>
      <div className='w-16'>
        <NormalizedTrustLogo id='armada' />
      </div>
    </div>
  ),
};
