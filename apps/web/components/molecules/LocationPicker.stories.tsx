import { Button } from '@jovie/ui';
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
      <Button variant='outline' size='sm'>
        Choose a city
      </Button>
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
