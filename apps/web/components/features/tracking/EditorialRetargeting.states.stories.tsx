import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EditorialRetargeting } from './EditorialRetargeting';

function EmptyRegistryFrame() {
  return (
    <div className='min-h-40 bg-base p-8 text-primary-token'>
      <p className='text-sm'>
        No editorial route is registered, so the adapter stays silent and mounts
        no pixel.
      </p>
      <EditorialRetargeting entries={[]} pixelId='storybook-pixel' />
    </div>
  );
}

const meta = {
  title: 'Tracking/EditorialRetargeting States',
  component: EditorialRetargeting,
  args: {
    entries: [],
    pixelId: 'storybook-pixel',
  },
} satisfies Meta<typeof EditorialRetargeting>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an empty retargeting registry, so nothing mounts. */
export const EmptyRegistry: Story = {
  render: EmptyRegistryFrame,
};
