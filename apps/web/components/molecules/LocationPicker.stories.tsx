import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LocationPicker } from './LocationPicker';

const meta = {
  title: 'Molecules/LocationPicker',
  component: LocationPicker,
  parameters: {
    layout: 'centered',
  },
  args: {
    value: null,
    onSelect: fn(),
    trigger: (
      <button
        type='button'
        className='rounded-md border border-subtle bg-surface-0 px-3 py-1.5 text-sm text-primary-token'
      >
        Choose a city
      </button>
    ),
  },
} satisfies Meta<typeof LocationPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Choose a city',
    });
    await userEvent.click(trigger);
    await expect(
      within(document.body).getByPlaceholderText('Search cities...')
    ).toBeInTheDocument();
  },
};

export const WithSelectedValue: Story = {
  args: {
    value: 'los angeles, ca',
  },
};

export const CustomPlaceholder: Story = {
  args: {
    placeholder: 'Where do you perform?',
  },
};
