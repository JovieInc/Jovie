import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { ArtistProfileRailToggle } from './ArtistProfileRailToggle';

const meta = {
  title: 'Shell/ArtistProfileRailToggle',
  component: ArtistProfileRailToggle,
  parameters: { layout: 'centered' },
  decorators: [withDashboardProviders],
} satisfies Meta<typeof ArtistProfileRailToggle>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reversible: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  },
};
