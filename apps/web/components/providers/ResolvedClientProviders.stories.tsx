import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, use } from 'react';
import { ResolvedClientProviders as ResolvedClientProvidersAsync } from './ResolvedClientProviders';

// ResolvedClientProviders is an async server component. Each variant's
// promise is created once, outside render: React discards hook state while a
// first mount suspends, so an in-render promise was new on every retry.
const resolved = new Map<string, Promise<ReactNode>>();

function ResolvedClientProviders({
  children,
  forceSignedOutDefaults = false,
}: {
  readonly children: ReactNode;
  readonly forceSignedOutDefaults?: boolean;
}) {
  const key = String(forceSignedOutDefaults);
  let tree = resolved.get(key);
  if (!tree) {
    tree = ResolvedClientProvidersAsync({ children, forceSignedOutDefaults });
    resolved.set(key, tree);
  }
  return use(tree);
}

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
