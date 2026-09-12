import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OverflowMenu } from './OverflowMenu';

const meta = {
  title: 'Molecules/Inspector/OverflowMenu',
  component: OverflowMenu,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['align', 'testId'] },
  },
  args: {
    label: 'Share link actions',
    disabled: false,
    items: [
      { id: 'open', label: 'Open', onSelect: () => undefined },
      {
        id: 'revoke',
        label: 'Revoke private link',
        variant: 'destructive',
        separatorBefore: true,
        onSelect: () => undefined,
      },
    ],
  },
} satisfies Meta<typeof OverflowMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShareLinkActions: Story = {};
