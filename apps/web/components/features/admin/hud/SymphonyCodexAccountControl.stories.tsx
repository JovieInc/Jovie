import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SymphonyCodexAccountControl } from './SymphonyCodexAccountControl';

const meta = {
  title: 'Features/Admin/Hud/SymphonyCodexAccountControl',
  component: SymphonyCodexAccountControl,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SymphonyCodexAccountControl>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
