import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import SentryExamplePage from './page';

const meta = {
  title: 'Dev/SentryExamplePage',
  component: SentryExamplePage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SentryExamplePage>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
