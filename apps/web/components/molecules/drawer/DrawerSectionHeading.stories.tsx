import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerSectionHeading } from './DrawerSectionHeading';

const meta: Meta<typeof DrawerSectionHeading> = {
  title: 'Molecules/Drawer/DrawerSectionHeading',
  component: DrawerSectionHeading,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Contact Info',
  },
};

export default meta;
type Story = StoryObj<typeof DrawerSectionHeading>;

export const Default: Story = {};

export const SemanticHeading: Story = {
  args: {
    as: 'h3',
    children: 'Role',
  },
};

/** A long caller label wraps inside a narrow drawer column. */
export const LongContent: Story = {
  args: {
    as: 'h3',
    children: 'Booking, management and publishing contacts for every territory',
  },
  decorators: [
    StoryComponent => (
      <div className='w-48'>
        <StoryComponent />
      </div>
    ),
  ],
};

export const Rtl: Story = {
  args: {
    as: 'h3',
    children: 'معلومات الاتصال',
  },
  decorators: [
    StoryComponent => (
      <div dir='rtl' lang='ar' className='w-48'>
        <StoryComponent />
      </div>
    ),
  ],
};
