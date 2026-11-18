import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { MenuView } from './MenuView';

/**
 * Rendered states of the profile overflow menu. The default stories live in
 * MenuView.stories.tsx.
 */
const MenuFrame: Decorator = function MenuFrame(Story) {
  return (
    <div className='bg-base p-6'>
      <Story />
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
  title: 'Profile/Views/MenuView/States',
  component: MenuView,
  args: {
    onNavigate: fn(),
    hasReleases: false,
    hasTourDates: false,
    hasTip: false,
    hasContacts: false,
  },
  decorators: [MenuFrame],
} satisfies Meta<typeof MenuView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no optional entries are available, so only Share remains. */
export const EmptyOptionalEntries: Story = {};

/** Right-to-left: every entry in an Arabic document direction. */
export const RtlArabicDocument: Story = {
  args: { hasTip: true, hasContacts: true, onOpenReleaseCredits: fn() },
  decorators: [RtlFrame],
};
