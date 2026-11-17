import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Home, ListTodo, Settings, Shield, Users } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';
import { APP_ROUTES } from '@/constants/routes';
import type { LiquidGlassMenuItem } from './LiquidGlassMenu';
import { LiquidGlassMenu } from './LiquidGlassMenu';

const primaryItems: LiquidGlassMenuItem[] = [
  { id: 'home', label: 'Home', href: APP_ROUTES.DASHBOARD, icon: Home },
  { id: 'audience', label: 'Audience', href: APP_ROUTES.AUDIENCE, icon: Users },
];

const expandedItems: LiquidGlassMenuItem[] = [
  { id: 'tasks', label: 'Tasks', href: APP_ROUTES.TASKS, icon: ListTodo },
  {
    id: 'settings',
    label: 'Settings',
    href: APP_ROUTES.SETTINGS,
    icon: Settings,
  },
];

type MenuStory = StoryObj<typeof LiquidGlassMenu>;

/** Opens the More menu so the expanded state renders. */
const openMoreMenu: MenuStory['play'] = async function openMoreMenu({
  canvasElement,
}) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'More options' }));
  await expect(
    await canvas.findByRole('button', { name: 'Close menu' })
  ).toHaveAttribute('aria-expanded', 'true');
};

/**
 * Rendered states of the mobile bottom navigation. The default bar lives in
 * LiquidGlassMenu.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Organisms/LiquidGlassMenu/States',
  component: LiquidGlassMenu,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['item', 'inputMethod', 'items', 'pathname'],
    },
  },
  args: {
    primaryItems,
    expandedItems,
    onSearchClick: () => {},
    onSignOut: () => {},
  },
  render: function LiquidGlassMenuStory(args, context) {
    const rtl = context.parameters.rtl === true;
    return (
      <div
        dir={rtl ? 'rtl' : undefined}
        lang={rtl ? 'ar' : undefined}
        className='relative h-96 bg-base'
      >
        {/* The runner's viewport is desktop-width, where this mobile-only bar
            is correctly lg:hidden — its play functions could never reach it.
            Pin the mobile presentation here so the bar's interactive states
            are exercisable (same story-scoped override pattern as
            NumberedSection's scroll-animation settle). */}
        <style>{`[data-mobile-navigation='true'] { display: block !important; }`}</style>
        <LiquidGlassMenu {...args} />
      </div>
    );
  },
} satisfies Meta<typeof LiquidGlassMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the More menu opens with no extra destinations, only Sign out. */
export const EmptyExpandedMenu: Story = {
  args: { expandedItems: [] },
  play: openMoreMenu,
};

/** Partial: no search entry and no sign out, so the bar holds only its links and More. */
export const PartialNoSearchOrSignOut: Story = {
  args: { onSearchClick: undefined, onSignOut: undefined },
};

/** Long content: long labels and a badge past 99 in the open menu. */
export const LongContentLabels: Story = {
  args: {
    expandedItems: [
      {
        id: 'tasks',
        label: 'Release tasks waiting for review before the next drop',
        href: APP_ROUTES.TASKS,
        icon: ListTodo,
        badge: 240,
      },
      ...expandedItems.slice(1),
    ],
  },
  play: openMoreMenu,
};

/** Permission denied: a member without admin rights sees no Admin section. */
export const PermissionDeniedNoAdminSection: Story = {
  args: { adminItems: [] },
  play: openMoreMenu,
};

/** The admin view for comparison: the Admin section follows the destinations. */
export const AdminSectionVisible: Story = {
  args: {
    adminItems: [
      {
        id: 'admin',
        label: 'Admin',
        href: APP_ROUTES.SETTINGS_ADMIN,
        icon: Shield,
      },
    ],
  },
  play: openMoreMenu,
};

/** Right-to-left: Arabic labels in an RTL document with the menu open. */
export const RtlArabicMenu: Story = {
  args: {
    primaryItems: [
      { id: 'home', label: 'الرئيسية', href: APP_ROUTES.DASHBOARD, icon: Home },
    ],
    expandedItems: [
      { id: 'tasks', label: 'المهام', href: APP_ROUTES.TASKS, icon: ListTodo },
    ],
  },
  parameters: { rtl: true },
  play: openMoreMenu,
};
