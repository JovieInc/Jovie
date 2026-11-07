import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HomepageNameSearch } from './HomepageNameSearch';

const meta = {
  title: 'Marketing/HomepageNameSearch',
  component: HomepageNameSearch,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HomepageNameSearch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('textbox', { name: 'Search your name' })
    ).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox'), 'Alex Example');
    await expect(canvas.getByRole('textbox')).toHaveValue('Alex Example');
    await expect(canvas.getByRole('button', { name: 'Find me' })).toBeVisible();
  },
};
