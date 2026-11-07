import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TeleprompterStudio } from './TeleprompterStudio';

// Storybook has no camera, so the studio renders its blocked or starting
// state; the recording frames are covered by the per-part stories.
const meta = {
  title: 'Features/TeleprompterStudio/TeleprompterStudio',
  component: TeleprompterStudio,
  parameters: { layout: 'fullscreen', themes: { themeOverride: 'dark' } },
  args: {
    context: {
      profileId: 'profile-story',
      kind: 'promo',
      title: 'Release day shout-out',
      script:
        "It's release day. Save the Night is out everywhere, and I made it for the late drives home.",
      showcaseVariant: 'direct',
      source: 'chat_proposal',
      questions: ['What were you feeling the night you wrote it?'],
    },
    onClose: () => {},
  },
} satisfies Meta<typeof TeleprompterStudio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoCamera: Story = {};
