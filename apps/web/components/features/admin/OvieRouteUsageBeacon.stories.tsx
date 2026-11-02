import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieRouteUsageBeacon } from './OvieRouteUsageBeacon';

const meta = {
  title: 'Features/Admin/OvieRouteUsageBeacon',
  component: OvieRouteUsageBeacon,
  parameters: {
    layout: 'centered',
    nextjs: { navigation: { pathname: '/app/ov/shipping' } },
  },
  decorators: [
    Story => (
      <>
        <p className='text-2xs text-secondary-token'>
          Renderless: counts one view per Ovie route.
        </p>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof OvieRouteUsageBeacon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
