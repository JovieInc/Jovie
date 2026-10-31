import '@/app/globals.css';
import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieFullscreenToggle } from './OvieFullscreenToggle';

const meta = {
  title: 'Features/Admin/Hud/OvieFullscreenToggle',
  component: OvieFullscreenToggle,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: { onToggle: () => undefined, inDesktopApp: false },
} satisfies Meta<typeof OvieFullscreenToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web: Story = {};
export const MacApp: Story = { args: { inDesktopApp: true } };
