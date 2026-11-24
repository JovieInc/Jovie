import { Button } from '@jovie/ui';
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
      <Button variant='outline' size='sm'>
        Choose genres
      </Button>
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

/** Empty search results face (typed query matches nothing). */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Choose genres',
    });
    await userEvent.click(trigger);
    const search = within(document.body).getByPlaceholderText(
      'Search genres...'
    );
    await userEvent.type(search, 'zzzz-no-such-genre');
    await expect(
      within(document.body).getByText('No matching genres')
    ).toBeInTheDocument();
  },
};

/** Long selected labels + long search placeholder pressure. */
export const LongContent: Story = {
  args: {
    selected: [
      'contemporary classical crossover',
      'experimental electronic ambient',
    ],
    maxGenres: 5,
    trigger: (
      <Button variant='outline' size='sm'>
        Choose genres — contemporary classical crossover and experimental
        electronic ambient
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: /Choose genres/,
    });
    await userEvent.click(trigger);
    await expect(
      within(document.body).getByPlaceholderText('Search genres...')
    ).toBeInTheDocument();
  },
};

/** RTL overflow frame for the open list. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-56'>
        <Story />
      </div>
    ),
  ],
  args: {
    selected: ['pop'],
    trigger: (
      <Button variant='outline' size='sm'>
        اختيار الأنواع
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'اختيار الأنواع',
    });
    await userEvent.click(trigger);
    await expect(
      within(document.body).getByPlaceholderText('Search genres...')
    ).toBeInTheDocument();
  },
};
