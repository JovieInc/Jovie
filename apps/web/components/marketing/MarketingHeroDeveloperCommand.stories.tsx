import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingHeroDeveloperCommand } from './MarketingHeroDeveloperCommand';

const meta = {
  title: 'Marketing/Primitives/MarketingHeroDeveloperCommand',
  component: MarketingHeroDeveloperCommand,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof MarketingHeroDeveloperCommand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CliInstall: Story = {
  args: {
    command: 'npm install --global @jovie/cli',
    copyLabel: 'Copy install command',
    copiedLabel: 'Copied install command',
    errorLabel: 'Copy failed',
    availabilityNote: 'Available after the versioned npm release.',
  },
};
