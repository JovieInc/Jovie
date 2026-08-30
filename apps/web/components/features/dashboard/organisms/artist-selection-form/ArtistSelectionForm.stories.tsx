import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistSelectionForm } from './ArtistSelectionForm';

const meta = {
  title: 'Features/Dashboard/Organisms/ArtistSelectionForm/ArtistSelectionForm',
  component: ArtistSelectionForm,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ArtistSelectionForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
