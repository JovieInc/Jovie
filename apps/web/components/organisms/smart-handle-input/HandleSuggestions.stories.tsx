import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { HandleSuggestions } from './HandleSuggestions';

const meta = {
  title: 'Organisms/SmartHandleInput/HandleSuggestions',
  component: HandleSuggestions,
  parameters: {
    layout: 'centered',
  },
  args: {
    suggestions: ['jovie1', 'jovie_music', 'thejovie'],
    disabled: false,
    onChange: fn(),
  },
} satisfies Meta<typeof HandleSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', {
      name: '@jovie1',
    });
    await userEvent.click(button);
    await expect(args.onChange).toHaveBeenCalledWith('jovie1');
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const Empty: Story = {
  args: {
    suggestions: [],
  },
};
