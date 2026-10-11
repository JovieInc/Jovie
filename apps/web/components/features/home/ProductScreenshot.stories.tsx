import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ProductScreenshot } from './ProductScreenshot';

const image = getMarketingExportImage('dashboard-audience-desktop');

const meta = {
  title: 'Features/Home/ProductScreenshot',
  component: ProductScreenshot,
  parameters: {
    layout: 'centered',
  },
  args: {
    src: image.publicUrl,
    alt: image.alt,
    width: 720,
    height: 450,
    skipCheck: true,
  },
} satisfies Meta<typeof ProductScreenshot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WindowChrome: Story = {};

export const MinimalChrome: Story = {
  args: {
    chrome: 'minimal',
  },
};
