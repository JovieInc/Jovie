import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  DesktopAuthCancelButton,
  DesktopAuthHeading,
  DesktopAuthStatus,
} from './DesktopAuthSharedView';

/**
 * The heading, status line and cancel action every Mac sign-in handoff
 * method shares. Composed here the way DesktopAuthHandoffActions stacks them.
 */
const meta = {
  title: 'Auth/Desktop/DesktopAuthSharedView',
  component: DesktopAuthHeading,
  parameters: { layout: 'centered' },
  args: { copy: 'Continue in your browser, then return to Jovie.' },
} satisfies Meta<typeof DesktopAuthHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

function SharedView({
  copy,
  status,
}: Readonly<{ copy: string; status: string | null }>) {
  return (
    <section className='flex w-90 flex-col items-center px-6 py-4 text-center'>
      <DesktopAuthHeading copy={copy} />
      <DesktopAuthStatus id='desktop-auth-status-story' text={status} />
      <DesktopAuthCancelButton onCancel={() => undefined} />
    </section>
  );
}

export const Default: Story = {
  render: args => <SharedView copy={args.copy} status='Check your browser.' />,
};

/** Empty: no status yet, so the live region holds its height with no text. */
export const EmptyStatus: Story = {
  render: args => <SharedView copy={args.copy} status={null} />,
};

/** Long content: the longest handoff copy and a failure status, wrapped. */
export const LongContentFailure: Story = {
  args: {
    copy: 'Signed in but Jovie did not open? Enter the code shown in your browser or on your phone, or copy the sign-in link into any browser on this Mac.',
  },
  render: args => (
    <SharedView
      copy={args.copy}
      status='The browser did not open. Try again, or copy the sign-in link.'
    />
  ),
};

/** Right-to-left: Arabic heading copy and status. */
export const RtlArabic: Story = {
  args: { copy: 'تابع في المتصفح، ثم عُد إلى Jovie.' },
  render: args => (
    <div dir='rtl' lang='ar'>
      <SharedView copy={args.copy} status='تحقق من المتصفح.' />
    </div>
  ),
};
