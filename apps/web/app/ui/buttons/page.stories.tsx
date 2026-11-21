// Drift T2.1: visual evidence for /ui/buttons after IconButton alias delete.
import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ButtonsPage from './page';

const meta = {
  title: 'Design System/ButtonsShowcase',
  component: ButtonsPage,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof ButtonsPage>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
