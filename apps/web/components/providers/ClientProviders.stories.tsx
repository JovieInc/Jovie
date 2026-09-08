import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ClientProviders } from './ClientProviders';

const meta: Meta<typeof ClientProviders> = {
  title: 'Providers/ClientProviders',
  component: ClientProviders,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {
  args: {
    children: <p>Signed-in app shell</p>,
  },
};

export const SignedOutDefaults: Story = {
  args: {
    forceSignedOutDefaults: true,
    children: <p>Public profile shell</p>,
  },
};

export const SkipCoreProviders: Story = {
  args: {
    skipCoreProviders: true,
    children: <p>Auth-only shell</p>,
  },
};
