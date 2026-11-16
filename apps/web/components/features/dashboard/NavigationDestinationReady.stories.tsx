import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NavigationDestinationReady } from './NavigationDestinationReady';

/**
 * NavigationDestinationReady is a headless readiness signal: it renders
 * nothing and fires `markNavigationDestinationReady` once `ready` is true.
 * The story exists to satisfy story coverage and to document usage; there
 * is no visual output to assert against.
 */
const meta = {
  title: 'Dashboard/NavigationDestinationReady',
  component: NavigationDestinationReady,
  parameters: {
    layout: 'centered',
  },
  args: {
    destination: 'library',
    ready: true,
  },
} satisfies Meta<typeof NavigationDestinationReady>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  render: args => (
    <div className='text-sm text-tertiary-token'>
      Renders nothing — marks &quot;{args.destination}&quot; ready on mount.
      <NavigationDestinationReady {...args} />
    </div>
  ),
};

export const NotYetReady: Story = {
  args: {
    ready: false,
  },
  render: args => (
    <div className='text-sm text-tertiary-token'>
      Renders nothing — destination data is still loading, so no readiness
      signal fires.
      <NavigationDestinationReady {...args} />
    </div>
  ),
};

/** The destination's data is still loading: the signal holds until ready. */
export const LoadingDestinationData: Story = {
  args: {
    destination: 'calendar',
    ready: false,
  },
  render: args => (
    <div className='text-sm text-tertiary-token' aria-busy='true'>
      Loading &quot;{args.destination}&quot;. Renders nothing and holds the
      readiness signal until the data arrives.
      <NavigationDestinationReady {...args} />
    </div>
  ),
};
