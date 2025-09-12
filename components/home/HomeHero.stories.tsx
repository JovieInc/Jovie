import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeHero } from './HomeHero';

const meta: Meta<typeof HomeHero> = {
  title: 'Home/Organisms/HomeHero',
  component: HomeHero,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'light',
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomSubtitle: Story = {
  args: {
    subtitle: 'Build your music career with our all-in-one platform',
  },
};

export const WithJSXSubtitle: Story = {
  args: {
    subtitle: (
      <>
        Create your <strong>professional</strong> artist page
      </>
    ),
  },
};
