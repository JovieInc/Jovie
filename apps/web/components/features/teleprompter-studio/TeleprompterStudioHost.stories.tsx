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

function OpenStudio({
  title = 'Release day shout-out',
  label = 'Open Studio',
}: {
  readonly title?: string;
  readonly label?: string;
}) {
  return (
    <>
      <Button
        variant='secondary'
        onClick={() =>
          startTeleprompterRecording({
            profileId: 'profile-story',
            kind: 'promo',
            title,
            script: "It's release day. Save the Night is out everywhere.",
            showcaseVariant: 'direct',
            source: 'chat_proposal',
          })
        }
      >
        {label}
      </Button>
      <TeleprompterStudioHost />
    </>
  );
}

export const Idle: Story = { render: () => <OpenStudio /> };
export const LongTitle: Story = {
  render: () => (
    <OpenStudio
      title='Release day shout-out for Save the Night, the extended club mix with the live strings and the new spoken intro'
      label='Open Studio For The Extended Club Mix Shout-Out'
    />
  ),
};
export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <OpenStudio />
    </div>
  ),
};
