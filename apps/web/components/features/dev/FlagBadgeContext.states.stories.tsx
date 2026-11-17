import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FlagBadgeProvider, useFlagBadges } from './FlagBadgeContext';

function FlagBadgeConsumerDemo({ note }: { readonly note?: string }) {
  const flagBadges = useFlagBadges();
  return (
    <div className='max-w-sm text-sm text-primary-token'>
      showBadges: {String(flagBadges?.showBadges ?? false)}
      {note ? <p className='mt-2 text-secondary-token'>{note}</p> : null}
    </div>
  );
}

/**
 * State coverage for the dev flag-badge context. The provider renders its
 * children unchanged; these change only the wrapped content or direction.
 */
const meta = {
  title: 'Features/Dev/FlagBadgeContext States',
  component: FlagBadgeProvider,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: <FlagBadgeConsumerDemo />,
  },
} satisfies Meta<typeof FlagBadgeProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: wrapped content long enough to wrap several lines. */
export const LongContentChildren: Story = {
  args: {
    children: (
      <FlagBadgeConsumerDemo note='Flag badges mark every surface that is behind a feature flag so a reviewer can see what a customer would not. The choice is kept in this browser only.' />
    ),
  },
};

/** Right-to-left: wrapped content inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
