import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OverflowMenu } from './OverflowMenu';

const meta = {
  title: 'Molecules/Inspector/OverflowMenu',
  component: OverflowMenu,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['align', 'testId'],
    },
  },
} satisfies Meta<typeof OverflowMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShareLinkActions: Story = {
  args: {
    label: 'Share link actions',
    items: [
      {
        id: 'visibility',
        label: 'Make public',
        onSelect: () => undefined,
      },
      {
        id: 'open',
        label: 'Open',
        onSelect: () => undefined,
      },
      {
        id: 'revoke',
        label: 'Revoke private link',
        variant: 'destructive',
        separatorBefore: true,
        onSelect: () => undefined,
      },
    ],
  },
};

export const DisabledOverflow: Story = {
  args: {
    label: 'Actions for Spotify',
    disabled: true,
    items: [
      {
        id: 'remove',
        label: 'Remove Spotify',
        variant: 'destructive',
        onSelect: () => undefined,
      },
    ],
  },
};
