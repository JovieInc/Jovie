import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepagePrimaryAction } from './HomepagePrimaryAction';

const meta = {
  title: 'Marketing/HomepagePrimaryAction',
  component: HomepagePrimaryAction,
  parameters: { layout: 'centered' },
  args: {
    appearance: 'editorial',
    placeholder: 'Search your name',
    submitLabel: 'Find me',
    submitTestId: 'homepage-primary-cta',
  },
} satisfies Meta<typeof HomepagePrimaryAction>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentLaunch: Story = {};
