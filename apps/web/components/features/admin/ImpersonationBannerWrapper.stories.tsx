import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, use } from 'react';
import { ImpersonationBannerWrapper as ImpersonationBannerWrapperAsync } from './ImpersonationBannerWrapper';

// ImpersonationBannerWrapper is an async server component. The promise lives
// outside render so React can reuse it when the first render suspends.
const resolved = ImpersonationBannerWrapperAsync();

function ImpersonationBannerWrapper() {
  return use(resolved as Promise<ReactNode>);
}

const meta = {
  title: 'Features/Admin/ImpersonationBannerWrapper',
  component: ImpersonationBannerWrapper,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Server wrapper that renders the impersonation banner only when the environment, authenticated administrator, and signed impersonation state are all valid.',
      },
    },
  },
} satisfies Meta<typeof ImpersonationBannerWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnvironmentState: Story = {};
