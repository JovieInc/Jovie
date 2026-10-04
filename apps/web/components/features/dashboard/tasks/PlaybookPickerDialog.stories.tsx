import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { PlaybookPickerDialog } from './PlaybookPickerDialog';

const meta = {
  title: 'Dashboard/Tasks/PlaybookPickerDialog',
  component: PlaybookPickerDialog,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    pending: false,
    onClose: fn(),
    onSubmit: fn(),
    onOpenReleases: fn(),
  },
} satisfies Meta<typeof PlaybookPickerDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Music users land on the release plan, which starts from a release. */
export const Artist: Story = {
  args: { creatorType: 'artist' },
};

/** Date-anchored playbooks show the name and date fields. */
export const Podcaster: Story = {
  args: { creatorType: 'podcaster' },
};

export const Creating: Story = {
  args: { creatorType: 'creator', pending: true },
};
