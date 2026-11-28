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

/** Empty catalog face — no city matches; free-text escape hatch is the empty chrome. */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Choose a city',
    });
    await userEvent.click(trigger);
    const search = within(document.body).getByPlaceholderText(
      'Search cities...'
    );
    await userEvent.type(search, 'zzzz-no-such-city');
    await expect(
      within(document.body).getByText(/Use \u201czzzz-no-such-city\u201d/)
    ).toBeInTheDocument();
  },
};

/** Long selected value + long placeholder pressure. */
export const LongContent: Story = {
  args: {
    value: 'san francisco bay area, california, united states',
    placeholder:
      'Search cities, metro areas, touring markets, and hometown labels...',
    trigger: (
      <Button variant='outline' size='sm'>
        Choose a city — San Francisco Bay Area, California, United States
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: /Choose a city/,
    });
    await userEvent.click(trigger);
    await expect(
      within(document.body).getByPlaceholderText(
        'Search cities, metro areas, touring markets, and hometown labels...'
      )
    ).toBeInTheDocument();
  },
};

/** RTL overflow frame for the open list. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-64'>
        <Story />
      </div>
    ),
  ],
  args: {
    value: 'nashville, tn',
    trigger: (
      <Button variant='outline' size='sm'>
        اختر مدينة
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'اختر مدينة',
    });
    await userEvent.click(trigger);
    await expect(
      within(document.body).getByPlaceholderText('Search cities...')
    ).toBeInTheDocument();
  },
};
