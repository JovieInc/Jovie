import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { HeaderSearchAction } from './HeaderSearchAction';

const meta = {
  title: 'Molecules/HeaderSearchAction',
  component: HeaderSearchAction,
  parameters: {
    layout: 'centered',
  },
  args: {
    searchValue: '',
    onSearchValueChange: fn(),
    placeholder: 'Search releases...',
    ariaLabel: 'Search releases',
    submitAriaLabel: 'Open search',
  },
} satisfies Meta<typeof HeaderSearchAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Open search' });
    await userEvent.click(trigger);
    await expect(
      canvas.getByRole('searchbox', { name: 'Search releases' })
    ).toBeInTheDocument();
  },
};

export const AlwaysOpen: Story = {
  args: {
    alwaysOpen: true,
  },
};

export const WithValue: Story = {
  args: {
    alwaysOpen: true,
    searchValue: 'midnight',
  },
};
