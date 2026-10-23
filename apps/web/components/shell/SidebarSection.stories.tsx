import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { House, Users } from 'lucide-react';
import { useArgs } from 'storybook/preview-api';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarSection } from './SidebarSection';

const meta = {
  title: 'Shell/SidebarSection',
  component: SidebarSection,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-(--app-shell-sidebar-width) bg-sidebar'>
        <Story />
      </div>
    ),
  ],
  args: {
    name: 'Workspace',
    open: true,
    onToggle: fn(),
    itemCount: 2,
    collapsed: false,
    children: null,
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <SidebarSection
        {...args}
        onToggle={() => {
          args.onToggle();
          updateArgs({ open: !args.open });
        }}
      >
        <SidebarNavItem
          collapsed={args.collapsed ?? false}
          item={{ label: 'Home', icon: House }}
        />
        <SidebarNavItem
          collapsed={args.collapsed ?? false}
          item={{ label: 'Audience', icon: Users }}
        />
      </SidebarSection>
    );
  },
} satisfies Meta<typeof SidebarSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: 'Workspace' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  },
};

export const Closed: Story = { args: { open: false } };

export const Collapsed: Story = { args: { collapsed: true } };

export const CollapsedClosed: Story = {
  args: { collapsed: true, open: false },
};

export const LongLabel: Story = {
  args: { name: 'Workspace navigation with a long section name' },
};
