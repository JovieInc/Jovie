import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { NoirIonWorkspaceStatesSpecimen } from './NoirIonWorkspaceStatesSpecimen';

/**
 * State coverage for the Noir Ion workspace specimen. The Compact matrix
 * stays in NoirIonWorkspaceStatesSpecimen.stories.tsx; this renders the same
 * fixed matrix (including its loading row) and a right-to-left document.
 */
const meta = {
  title: 'Design System/Noir Ion/Workspace States States',
  component: NoirIonWorkspaceStatesSpecimen,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
} satisfies Meta<typeof NoirIonWorkspaceStatesSpecimen>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * Loading: the matrix's fourth row is the loading row (aria-busy, skeleton
 * cells); the story is the fixed specimen that contains it.
 */
export const LoadingRowSpecimen: Story = {};

/** Right-to-left: toolbar, rows and overlays mirror inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [RtlDecorator],
};
