import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { House, Users } from 'lucide-react';
import { useState } from 'react';
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
  // Local state instead of useArgs/updateArgs: the vitest browser runner does
  // not round-trip story args, so the Expanded play assertion (aria-expanded
  // flips on click) failed deterministically in the Storybook A11y shards.
  render: function Render(args) {
    const [open, setOpen] = useState(args.open);
    return (
      <SidebarSection
        {...args}
        open={open}
        onToggle={() => {
          args.onToggle();
          setOpen(current => !current);
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
