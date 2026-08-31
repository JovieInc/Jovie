import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieLauncherRail } from './OvieLauncherRail';

const meta = {
  title: 'Features/Admin/Hud/OvieLauncherRail',
  component: OvieLauncherRail,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OvieLauncherRail>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
