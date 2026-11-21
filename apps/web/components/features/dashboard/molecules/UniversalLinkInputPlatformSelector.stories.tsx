import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn, userEvent, within } from 'storybook/test';
import { UniversalLinkInputPlatformSelector } from './UniversalLinkInputPlatformSelector';

const meta = {
  title: 'Features/Dashboard/Molecules/UniversalLinkInputPlatformSelector',
  component: UniversalLinkInputPlatformSelector,
  parameters: { layout: 'centered' },
  args: {
    onPlatformSelect: fn(),
    onArtistSearchSelect: fn(),
    onRestoreFocus: fn(),
  },
} satisfies Meta<typeof UniversalLinkInputPlatformSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Partial: the control is disabled while a link is being added. */
export const PartialDisabled: Story = {
  args: { disabled: true },
};

/** RTL: the open menu mirrors in a right-to-left document. */
export const RtlOpenMenu: Story = {
  decorators: [
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl' className='min-h-96'>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Add link from platform' })
    );
  },
};
