import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsRouteSkeleton } from './SettingsRouteSkeleton';

const meta = {
  title: 'App/Settings/Route Skeleton',
  component: SettingsRouteSkeleton,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='relative flex h-160 w-full overflow-hidden bg-base'>
      <SettingsRouteSkeleton />
    </div>
  ),
} satisfies Meta<typeof SettingsRouteSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First-boot fallback for /app/settings/*, inside the real settings column. */
export const LoadingSettings: Story = {};

/** On a phone the section description bar hides, as the loaded header does. */
export const LoadingNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/** In a right-to-left document the field bars and actions mirror. */
export const RtlMirrored: Story = {
  render: () => (
    <div
      dir='rtl'
      lang='ar'
      className='relative flex h-160 w-full overflow-hidden bg-base'
    >
      <SettingsRouteSkeleton />
    </div>
  ),
};
