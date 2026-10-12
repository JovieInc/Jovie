import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, use } from 'react';
import { OperatorBannerWrapper as OperatorBannerWrapperAsync } from './OperatorBannerWrapper';

// OperatorBannerWrapper is an async server component; unwrap it with `use`.
// The promise is cached outside render: React discards hook state (useMemo
// included) while a first mount suspends, so an in-render promise was new on
// every retry and React rejected it as an async client component.
const resolved = new Map<boolean, Promise<ReactNode>>();

function OperatorBannerWrapper({ isAdmin }: { readonly isAdmin: boolean }) {
  let node = resolved.get(isAdmin);
  if (!node) {
    node = OperatorBannerWrapperAsync({ isAdmin });
    resolved.set(isAdmin, node);
  }
  return use(node);
}

const meta = {
  title: 'Features/Admin/OperatorBannerWrapper',
  component: OperatorBannerWrapper,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Server wrapper that decides on the server whether env issues exist. Renders whatever this environment actually reports — the same real early-return-to-null behavior production has outside non-production/admin contexts.',
      },
    },
  },
} satisfies Meta<typeof OperatorBannerWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AsAdmin: Story = {
  args: {
    isAdmin: true,
  },
};
