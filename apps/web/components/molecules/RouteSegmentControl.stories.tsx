import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RouteSegmentControl } from './RouteSegmentControl';

const meta: Meta<typeof RouteSegmentControl> = {
  title: 'UI/Molecules/RouteSegmentControl',
  component: RouteSegmentControl,
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/app/contacts', query: {} },
    },
    docs: {
      description: {
        component:
          'Route-aware adapter for the canonical SegmentControl. It preserves selected, focus, keyboard, and 44px touch-target behavior without introducing a second visual owner.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const options = [
  { value: 'contacts', label: 'Contacts', href: '/app/contacts' },
  {
    value: 'audience',
    label: 'Audience',
    href: '/app/contacts?tab=audience',
  },
] as const;

export const ContactsWorkspace: Story = {
  args: {
    value: 'contacts',
    options,
    'aria-label': 'Contacts Workspace',
    className: 'max-w-60',
  },
  render: args => (
    <div className='w-96 bg-(--app-shell-content-surface) p-3'>
      <RouteSegmentControl {...args} />
    </div>
  ),
};

export const Narrow: Story = {
  args: {
    value: 'audience',
    options,
    'aria-label': 'Contacts Workspace',
  },
  render: args => (
    <div className='w-44 bg-(--app-shell-content-surface) p-2'>
      <RouteSegmentControl {...args} />
    </div>
  ),
};
