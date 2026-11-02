import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoHomepageEmailMoment } from './DemoHomepageEmailMoment';

const meta = {
  title: 'Features/Demo/DemoHomepageEmailMoment',
  component: DemoHomepageEmailMoment,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Frame for the home-release-email product shot. The showcase page passes the shipped release-day template HTML; this story uses a stand-in message.',
      },
    },
  },
  args: {
    html: '<!DOCTYPE html><html><head></head><body><p>Release day email preview</p></body></html>',
  },
} satisfies Meta<typeof DemoHomepageEmailMoment>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
