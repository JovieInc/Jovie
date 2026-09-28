import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { GenrePicker } from './GenrePicker';

const meta = {
  title: 'Molecules/GenrePicker',
  component: GenrePicker,
  parameters: {
    layout: 'centered',
  },
  args: {
    selected: [],
    onChange: fn(),
    trigger: (
      <button
        type='button'
        className='rounded-md border border-subtle bg-surface-0 px-3 py-1.5 text-sm text-primary-token'
      >
        Choose genres
      </button>
    ),
  },
} satisfies Meta<typeof GenrePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Choose genres',
    });
    await userEvent.click(trigger);
    await expect(
      within(document.body).getByPlaceholderText('Search genres...')
    ).toBeInTheDocument();
  },
};

export const WithSelection: Story = {
  args: {
    selected: ['pop', 'r&b'],
  },
};

export const AtMaxGenres: Story = {
  args: {
    selected: ['pop', 'r&b', 'hip hop'],
    maxGenres: 3,
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Choose genres',
    });
    await userEvent.click(trigger);
    await expect(
      within(document.body).getByText('Maximum 3 genres reached')
    ).toBeInTheDocument();
  },
};
