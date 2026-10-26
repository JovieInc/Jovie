import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageWhatsNewSection } from './HomepageWhatsNew';

const meta: Meta<typeof HomepageWhatsNewSection> = {
  title: 'Marketing/Homepage/HomepageWhatsNew',
  component: HomepageWhatsNewSection,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeEntries: Story = {
  args: {
    entries: [
      { id: 'a', title: 'Choose your Jovie link', date: '2026-10-02' },
      { id: 'b', title: 'Help is easier to find', date: '2026-10-02' },
      { id: 'c', title: 'Search your chats', date: '2026-10-01' },
    ] as never,
  },
};
