import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleasePhoneContent } from './ReleasePhoneContent';
import { RELEASES } from './releases-data';

const meta = {
  title: 'Marketing/ReleasePhoneContent',
  component: ReleasePhoneContent,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReleasePhoneContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeverSayAWord: Story = {
  args: { release: RELEASES[0] },
};

export const TheDeepEnd: Story = {
  args: { release: RELEASES[1] },
};
