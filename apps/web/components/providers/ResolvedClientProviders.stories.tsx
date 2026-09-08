import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ResolvedClientProviders } from './ResolvedClientProviders';

const meta: Meta<typeof ResolvedClientProviders> = {
  title: 'Providers/ResolvedClientProviders',
  component: ResolvedClientProviders,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <p>Resolved app shell</p>,
  },
};

export const SignedOutDefaults: Story = {
  args: {
    forceSignedOutDefaults: true,
    children: <p>Resolved public shell</p>,
  },
};
