import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerEntityAvatar } from './DrawerEntityAvatar';
import { EntityHeaderCard } from './EntityHeaderCard';

const meta = {
  title: 'Molecules/Drawer/EntityHeaderCard',
  component: EntityHeaderCard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    image: <DrawerEntityAvatar name='Alex Rivera' />,
    title: 'Alex Rivera',
    subtitle: 'Management',
    meta: <span className='text-xs text-tertiary-token'>Los Angeles</span>,
  },
} satisfies Meta<typeof EntityHeaderCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {};

export const Grid: Story = {
  args: { layout: 'grid' },
};

export const StableLayout: Story = {
  args: {
    layout: 'grid',
    stableLayout: true,
    subtitle: undefined,
    meta: undefined,
  },
};
