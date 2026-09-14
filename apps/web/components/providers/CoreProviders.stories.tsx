import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CoreProviders } from './CoreProviders';

const meta = {
  title: 'Providers/CoreProviders',
  component: CoreProviders,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof CoreProviders>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialThemeMode: 'dark',
    children: (
      <main className='min-h-screen bg-surface-page p-8 text-primary-token'>
        Core provider surface
      </main>
    ),
  },
};
