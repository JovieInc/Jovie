import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SharedViewPage } from './SharedViewPage';
import { SAMPLE_VIEW_SPEC } from './ViewRenderer.stories';

const meta = {
  title: 'Features/Views/SharedViewPage',
  component: SharedViewPage,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    signedIn: false,
    view: {
      title: SAMPLE_VIEW_SPEC.title,
      spec: SAMPLE_VIEW_SPEC,
      updatedAt: new Date('2026-11-22T00:00:00Z'),
    },
  },
} satisfies Meta<typeof SharedViewPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {};

export const SignedIn: Story = { args: { signedIn: true } };
