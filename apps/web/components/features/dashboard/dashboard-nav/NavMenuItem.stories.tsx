import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { chatNavItem } from './config';
import { NavMenuItem } from './NavMenuItem';

const meta = {
  title: 'Features/Dashboard/NavMenuItem',
  component: NavMenuItem,
  parameters: {
    jovie: {
      uncoveredProps: [
        'preventNavigation',
        'renderAsButton',
        'onButtonClick',
        'onLinkClick',
        'onPressStart',
      ],
    },
  },
  decorators: [
    Story => (
      <ul className='w-56'>
        <Story />
      </ul>
    ),
  ],
  args: { item: chatNavItem, isActive: true },
} satisfies Meta<typeof NavMenuItem>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Active: Story = {};
