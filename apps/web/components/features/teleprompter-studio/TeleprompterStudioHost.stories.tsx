import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { startTeleprompterRecording } from '@/lib/teleprompter/recorder';
import { TeleprompterStudioHost } from './TeleprompterStudioHost';

const meta = {
  title: 'Features/TeleprompterStudio/TeleprompterStudioHost',
  component: TeleprompterStudioHost,
  parameters: { layout: 'centered', themes: { themeOverride: 'dark' } },
} satisfies Meta<typeof TeleprompterStudioHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  render: () => (
    <>
      <Button
        variant='secondary'
        onClick={() =>
          startTeleprompterRecording({
            profileId: 'profile-story',
            kind: 'promo',
            title: 'Release day shout-out',
            script: "It's release day. Save the Night is out everywhere.",
            showcaseVariant: 'direct',
            source: 'chat_proposal',
          })
        }
      >
        Open Studio
      </Button>
      <TeleprompterStudioHost />
    </>
  ),
};
