import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NoirIonWorkspaceStatesSpecimen } from './NoirIonWorkspaceStatesSpecimen';

const meta: Meta<typeof NoirIonWorkspaceStatesSpecimen> = {
  title: 'Design System/Noir Ion/Workspace States',
  component: NoirIonWorkspaceStatesSpecimen,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Compact table / toolbar / overlay / skeleton state matrix (JOV-4648). */
export const Compact: Story = {};
