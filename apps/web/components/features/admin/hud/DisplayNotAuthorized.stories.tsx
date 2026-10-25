import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DisplayNotAuthorized } from './DisplayNotAuthorized';

const meta = {
  title: 'Features/Admin/Hud/DisplayNotAuthorized',
  component: DisplayNotAuthorized,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DisplayNotAuthorized>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
