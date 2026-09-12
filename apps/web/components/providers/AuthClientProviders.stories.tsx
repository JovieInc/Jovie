import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthClientProviders } from './AuthClientProviders';

const meta: Meta<typeof AuthClientProviders> = {
  title: 'Providers/AuthClientProviders',
  component: AuthClientProviders,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <p>Auth route shell</p>,
  },
};
