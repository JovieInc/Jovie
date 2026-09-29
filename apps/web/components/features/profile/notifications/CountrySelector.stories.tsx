import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { COUNTRY_OPTIONS, CountrySelector } from './CountrySelector';

const meta = {
  title: 'Features/Profile/CountrySelector',
  component: CountrySelector,
  parameters: {
    layout: 'centered',
  },
  args: {
    country: COUNTRY_OPTIONS[0],
    onOpenChange: () => {},
    onSelect: () => {},
  },
} satisfies Meta<typeof CountrySelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

export const Open: Story = {
  args: {
    isOpen: true,
  },
};
