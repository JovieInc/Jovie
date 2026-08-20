import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceTableLoadingShell } from './AudienceTableLoadingShell';

const meta: Meta<typeof AudienceTableLoadingShell> = {
  title: 'Dashboard/Audience/AudienceTableLoadingShell',
  component: AudienceTableLoadingShell,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='flex h-screen min-h-0 bg-(--app-shell-content-surface)'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Compact: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
