import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { Banner } from './Banner';

const meta = {
  title: 'Feedback/Banner',
  component: Banner,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Imports are paused',
    description: 'Jovie will resume sync when Spotify is reachable.',
    variant: 'info',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['info', 'success', 'warning', 'error'],
    },
  },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Success: Story = {
  args: {
    title: 'Import complete',
    description: 'Your audience links are ready to review.',
    variant: 'success',
  },
};

export const Warning: Story = {
  args: {
    title: 'Import is taking longer than expected',
    description: 'You can keep editing while Jovie keeps checking platforms.',
    variant: 'warning',
  },
};

export const Error: Story = {
  args: {
    title: 'Import failed',
    description: 'Try again after checking the Spotify artist link.',
    variant: 'error',
  },
};

export const DismissibleWithAction: Story = {
  args: {
    title: 'Connection restored',
    description: 'Review the recovered profile matches.',
    variant: 'success',
    action: { label: 'Review', onClick: fn() },
    onDismiss: fn(),
  },
};

/** Partial: the optional description, action and dismiss are all absent. */
export const PartialTitleOnly: Story = {
  args: {
    title: 'Imports are paused',
    description: undefined,
    variant: 'info',
  },
};

export const LongContent: Story = {
  args: {
    title:
      'Spotify, Apple Music, YouTube Music and Amazon Music imports are paused while Jovie reconnects to every platform',
    description:
      'Your audience links, release smart links and pre-save campaigns keep working. Jovie will resume syncing new releases, artist profile updates and listener counts automatically as soon as each platform is reachable again, usually within a few minutes.',
    variant: 'warning',
    action: { label: 'View sync status', onClick: fn() },
    onDismiss: fn(),
  },
  render: args => (
    <div className='w-96'>
      <Banner {...args} />
    </div>
  ),
};

export const Rtl: Story = {
  args: {
    title: 'تم إيقاف الاستيراد مؤقتًا حتى يتوفر الاتصال بمنصة سبوتيفاي',
    description:
      'ستستأنف جوفي مزامنة الإصدارات الجديدة وروابط الجمهور تلقائيًا عند استعادة الاتصال.',
    variant: 'info',
    action: { label: 'مراجعة', onClick: fn() },
    onDismiss: fn(),
  },
  render: args => (
    <div dir='rtl' className='w-96'>
      <Banner {...args} />
    </div>
  ),
};
