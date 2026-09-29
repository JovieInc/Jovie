import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceCountryCell } from './AudienceCountryCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceCountryCell',
  component: AudienceCountryCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    geoCountry: 'US',
  },
} satisfies Meta<typeof AudienceCountryCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Unknown: Story = {
  args: {
    geoCountry: null,
  },
};
