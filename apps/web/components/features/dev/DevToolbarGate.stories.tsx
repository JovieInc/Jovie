import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DevToolbarGate } from './DevToolbarGate';

/**
 * State coverage for the dev toolbar gate. Customer-facing environments and
 * suppressed routes are denied the toolbar, so the gate renders nothing and
 * the page keeps no space for it.
 */
const meta = {
  title: 'Features/Dev/DevToolbarGate States',
  component: DevToolbarGate,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/app' } },
  },
  args: {
    env: 'production',
    sha: 'abc1234',
    version: '1.0.0',
  },
} satisfies Meta<typeof DevToolbarGate>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Restricted: a production deployment never shows developer controls. */
export const RestrictedProductionEnv: Story = {};

/** Restricted: a caller disables the toolbar even in local development. */
export const RestrictedDisabled: Story = {
  args: { env: 'development', disabled: true },
};
