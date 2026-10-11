import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FlagBadgeProvider, useFlagBadges } from './FlagBadgeContext';

function FlagBadgeConsumerDemo() {
  const flagBadges = useFlagBadges();
  return (
    <div className='text-sm text-primary-token'>
      showBadges: {String(flagBadges?.showBadges ?? false)}
    </div>
  );
}

const meta = {
  title: 'Features/Dev/FlagBadgeContext',
  component: FlagBadgeProvider,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Dev-only context that tracks whether feature-flag badges are shown, persisted to localStorage. Renders its children unchanged.',
      },
    },
  },
  args: {
    children: <FlagBadgeConsumerDemo />,
  },
} satisfies Meta<typeof FlagBadgeProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
