import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ImageAttachmentChip } from './ImageAttachmentChip';

const meta = {
  title: 'Jovie/ImageAttachmentChip',
  component: ImageAttachmentChip,
  parameters: {
    layout: 'centered',
  },
  args: {
    url: 'https://placehold.co/480x480/111827/f5f5f5?text=Cover',
  },
} satisfies Meta<typeof ImageAttachmentChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnLight: Story = {
  args: {
    name: 'cover-art-final.png',
    tone: 'onLight',
  },
};

export const OnDark: Story = {
  args: {
    name: 'cover-art-final.png',
    tone: 'onDark',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const NoName: Story = {
  args: {
    tone: 'onLight',
  },
};
