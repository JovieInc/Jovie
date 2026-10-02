import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Image from 'next/image';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { BrowserFrame } from './BrowserFrame';

const image = getMarketingExportImage('dashboard-audience-desktop');

const meta = {
  title: 'Features/Demo/BrowserFrame',
  component: BrowserFrame,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: (
      <Image
        src={image.publicUrl}
        alt={image.alt}
        width={image.width}
        height={image.height}
        className='block w-96'
      />
    ),
  },
} satisfies Meta<typeof BrowserFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
