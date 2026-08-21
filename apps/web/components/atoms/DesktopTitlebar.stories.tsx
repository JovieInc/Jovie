import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DesktopTitlebar } from './DesktopTitlebar';

const meta = {
  title: 'Atoms/DesktopTitlebar',
  component: DesktopTitlebar,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      // Browser fallback keeps the Electron-only navigation buttons disabled.
      uncoveredProps: ['disabled'],
    },
  },
  decorators: [
    Story => (
      <div className='min-h-12 bg-(--noir-ion-card) text-(--noir-ion-text-primary)'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DesktopTitlebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Browser renders the zero-height titlebar while Electron reveals its controls. */
export const Default: Story = {};
