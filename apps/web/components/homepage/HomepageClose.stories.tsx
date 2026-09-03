import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageClose } from './HomepageClose';

const meta = {
  title: 'Marketing/HomepageClose',
  component: HomepageClose,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Section 9 of the certified homepage: the close. Repeats the hero's only conversion control — the existing name search — under the locked closing lines.",
      },
    },
  },
} satisfies Meta<typeof HomepageClose>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
