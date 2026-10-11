import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AskJovieWidget } from './AskJovieWidget';

const meta = {
  title: 'Features/AskJovie/AskJovieWidget',
  component: AskJovieWidget,
  parameters: {
    layout: 'fullscreen',
    // `disabled` exists only on internal pending buttons, not a public prop.
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: {
    username: 'timwhite',
    artistName: 'Tim White',
  },
} satisfies Meta<typeof AskJovieWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Collapsed trigger: floating icon in the bottom-right corner. */
export const Collapsed: Story = {};

/** Open conversation surface with greeting, suggestions, and intents. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.ownerDocument.body.querySelector(
      'button[aria-label^="Ask Jovie about"]'
    );
    (trigger as HTMLButtonElement | null)?.click();
  },
};
