import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { BottomTabBar } from './BottomTabBar';

/**
 * Rendered states of the profile bottom tab bar. The default stories live in
 * BottomTabBar.stories.tsx.
 */
const DockFrame: Decorator = function DockFrame(Story) {
  return (
    <div className='flex min-h-svh items-end justify-center bg-surface-0 px-4'>
      <div className='w-full max-w-sm'>
        <Story />
      </div>
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Profile/Navigation/BottomTabBar/States',
  component: BottomTabBar,
  parameters: { layout: 'fullscreen' },
  decorators: [DockFrame],
  args: {
    activeTab: 'profile',
    hasTourDates: false,
    isMenuOpen: false,
    onTabSelect: fn(),
  },
} satisfies Meta<typeof BottomTabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Partial: the menu is open, so no destination is active and the lens hides.
 * Events stays visible even without events.
 */
export const PartialNoActiveDestination: Story = {
  args: { isMenuOpen: true },
};

/** Long content: a long claim bar rendered above the nav. */
export const LongContentAboveNav: Story = {
  args: {
    activeTab: 'about',
    aboveNav: (
      <p className='px-4 pb-2 text-center text-xs text-secondary-token'>
        Is this your profile? Claim it to edit your links, see who is listening
        and turn on alerts for every new release.
      </p>
    ),
  },
};

/** Right-to-left: the bar in an Arabic document direction. */
export const RtlArabicDocument: Story = {
  args: { activeTab: 'listen' },
  decorators: [RtlFrame],
};
