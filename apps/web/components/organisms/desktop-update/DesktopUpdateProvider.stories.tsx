import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DesktopUpdateProvider } from './DesktopUpdateProvider';

/**
 * JOV-12023: a browser Storybook canvas has no desktop update bridge, so the
 * provider renders only its children — the same path every web shell page
 * takes. The modal itself stays a deferred import (see DesktopUpdateModal
 * stories for its states).
 */
const meta = {
  title: 'Organisms/DesktopUpdateProvider',
  component: DesktopUpdateProvider,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DesktopUpdateProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WebShell: Story = {
  args: {
    children: (
      <div className='p-4 text-app text-primary-token'>Shell content</div>
    ),
  },
};
