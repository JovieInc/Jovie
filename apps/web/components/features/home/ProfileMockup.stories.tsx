import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ProfileMockup } from './ProfileMockup';
import { HOMEPAGE_PROFILE_PREVIEW_CATALOG } from './tim-white-catalog';

const meta = {
  title: 'Features/Home/ProfileMockup',
  component: ProfileMockup,
  decorators: [
    Story => (
      <div className='w-md max-w-full'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 1440] },
  },
  args: {
    name: 'Tim White',
    handle: 'tim',
    avatarUrl: '/images/avatars/tim-white.jpg',
  },
} satisfies Meta<typeof ProfileMockup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RealCatalog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole('list', { name: 'Releases' });
    for (const release of HOMEPAGE_PROFILE_PREVIEW_CATALOG) {
      await expect(list).toHaveTextContent(release.title);
    }
  },
};

export const MonogramAvatar: Story = {
  args: { avatarUrl: null, tagline: null },
};
