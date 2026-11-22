import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SAMPLE_VIEW_SPEC } from './ViewRenderer.stories';
import { ViewShell } from './ViewShell';

const meta = {
  title: 'Features/Views/ViewShell',
  component: ViewShell,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    token: 'a'.repeat(32),
    signedIn: false,
    view: {
      title: SAMPLE_VIEW_SPEC.title,
      spec: SAMPLE_VIEW_SPEC,
      updatedAt: new Date('2026-11-22T00:00:00Z'),
    },
  },
} satisfies Meta<typeof ViewShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {};

export const SignedIn: Story = { args: { signedIn: true } };

export const OwnsView: Story = {
  args: { signedIn: true, viewerOwnsView: true },
};
