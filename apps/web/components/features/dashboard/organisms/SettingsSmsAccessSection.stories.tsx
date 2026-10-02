import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsSmsAccessSection } from './SettingsSmsAccessSection';

const meta = {
  title: 'Dashboard/Organisms/SettingsSmsAccessSection',
  component: SettingsSmsAccessSection,
  parameters: {
    layout: 'padded',
    // `disabled` isn't a SettingsSmsAccessSectionProps field (no such prop
    // exists) — the story-state-matrix scanner picks up the internal
    // `disabled={isPending}` button attribute driven by the mutation state.
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: {
    smsSubscriberCount: 0,
    alreadyRequested: false,
  },
} satisfies Meta<typeof SettingsSmsAccessSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoAccessYet: Story = {};

export const AlreadyRequested: Story = {
  args: {
    alreadyRequested: true,
  },
};

export const WithSubscribers: Story = {
  args: {
    smsSubscriberCount: 42,
    alreadyRequested: true,
  },
};
