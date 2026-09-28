import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { MenuView } from './MenuView';

const meta = {
  title: 'Profile/Views/MenuView',
  component: MenuView,
  args: {
    onNavigate: fn(),
    hasReleases: true,
    hasTourDates: false,
    hasTip: true,
    hasContacts: true,
  },
  decorators: [
    Story => (
      <div className='bg-base p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MenuView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithReleaseCredits: Story = {
  args: { onOpenReleaseCredits: fn() },
};
