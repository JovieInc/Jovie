import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatTile } from './StatTile';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='w-40 bg-surface-0 p-3'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/StatTile States',
  component: StatTile,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    label: 'Views',
  },
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a blank value falls back to not measured, with the hint kept. */
export const PartialBlankValue: Story = {
  args: {
    value: '  ',
    hint: '+8% vs last week',
  },
};
