import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieMacHud } from './OvieMacHud';

const meta = {
  title: 'Features/Admin/Hud/OvieMacHud',
  component: OvieMacHud,
  parameters: { layout: 'fullscreen', jovie: { uncoveredProps: ['snapshot'] } },
} satisfies Meta<typeof OvieMacHud>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
