import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HudGithubBudgetPanel, HudShipperNeedPanel } from './HudShipperPanels';

const meta = {
  title: 'Features/Admin/Hud/HudShipperPanels',
  component: HudShipperNeedPanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HudShipperNeedPanel>;

type _Also = typeof HudGithubBudgetPanel;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
