import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { use, useMemo } from 'react';
import { OperatorBannerWrapper as OperatorBannerWrapperAsync } from './OperatorBannerWrapper';

// OperatorBannerWrapper is an async server component; unwrap it with `use`
// (same pattern as WikiPageArticle.stories.tsx) so the story can preview the
// resolved banner.
function OperatorBannerWrapper({ isAdmin }: { readonly isAdmin: boolean }) {
  const node = useMemo(
    () => OperatorBannerWrapperAsync({ isAdmin }),
    [isAdmin]
  );
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
