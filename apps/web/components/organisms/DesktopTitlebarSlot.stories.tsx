import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { DesktopTitlebarSlot } from './DesktopTitlebarSlot';

const meta = {
  title: 'Organisms/DesktopTitlebarSlot',
  component: DesktopTitlebarSlot,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const runtime = document.documentElement.dataset.desktopRuntime;
    const bridge = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    document.documentElement.removeAttribute('data-desktop-runtime');
    Reflect.deleteProperty(window, 'electronAPI');
    return () => {
      if (runtime === undefined) {
        document.documentElement.removeAttribute('data-desktop-runtime');
      } else {
        document.documentElement.dataset.desktopRuntime = runtime;
      }
      if (bridge) Object.defineProperty(window, 'electronAPI', bridge);
    };
  },
} satisfies Meta<typeof DesktopTitlebarSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Browser: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByTestId('electron-titlebar-row')
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Go Back' })
    ).not.toBeInTheDocument();
  },
};

export const Desktop: Story = {
  beforeEach: () => {
    document.documentElement.dataset.desktopRuntime = 'electron';
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Go Back' })
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Go Forward' })
    ).toBeDisabled();
  },
};
