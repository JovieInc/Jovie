import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InstallBanner } from './InstallBanner';

const meta = {
  title: 'Shell/InstallBanner',
  component: InstallBanner,
  parameters: {
    jovie: {
      uncoveredProps: ['disabled'],
    },
    layout: 'centered',
  },
} satisfies Meta<typeof InstallBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    onDismiss: () => {},
  },
};

/** A custom prompt that sets only its title and drops the CTA icon. */
export const PartialCustomTitle: Story = {
  args: {
    open: true,
    onDismiss: () => {},
    title: 'Claim your handle',
    ctaLabel: 'Claim',
    ctaIcon: null,
  },
  decorators: [
    Story => (
      <div className='w-60'>
        <Story />
      </div>
    ),
  ],
};

export const LongContent: Story = {
  args: {
    open: true,
    onDismiss: () => {},
    title: 'Get Jovie for desktop on macOS, Windows and Linux workstations',
    description:
      'Push-to-talk in any app, native keyboard shortcuts, offline drafts and a menu bar player that keeps your release previews one click away.',
    ctaLabel: 'Install the desktop app',
  },
  decorators: [
    Story => (
      <div className='w-60'>
        <Story />
      </div>
    ),
  ],
};

export const Rtl: Story = {
  args: {
    open: true,
    onDismiss: () => {},
    title: 'احصل على Jovie لسطح المكتب',
    description: 'التحدث بالضغط في أي تطبيق، واختصارات أصلية.',
    ctaLabel: 'تثبيت',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-60'>
        <Story />
      </div>
    ),
  ],
};
