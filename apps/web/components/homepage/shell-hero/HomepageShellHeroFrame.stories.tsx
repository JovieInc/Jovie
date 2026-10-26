import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageShellHeroFrame } from './HomepageShellHeroFrame';

const meta: Meta<typeof HomepageShellHeroFrame> = {
  title: 'Marketing/Homepage/HomepageShellHeroFrame',
  component: HomepageShellHeroFrame,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headingId: 'shell-hero-frame-story',
    children: (
      <h1 id='shell-hero-frame-story' className='p-8 text-primary-token'>
        Hero frame
      </h1>
    ),
  },
};
