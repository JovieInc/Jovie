import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InfoPopover } from './InfoPopover';

const meta = {
  title: 'Molecules/Inspector/InfoPopover',
  component: InfoPopover,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof InfoPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DownloadsHelper: Story = {
  args: {
    label: 'About downloads',
    testId: 'downloads-info',
    children: (
      <p>
        Email gate to file. Only recordings with explicit full-control
        attestation can go live.
      </p>
    ),
  },
};
