import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FileAttachmentChip } from './FileAttachmentChip';

const meta = {
  title: 'Jovie/FileAttachmentChip',
  component: FileAttachmentChip,
  parameters: {
    layout: 'centered',
  },
  args: {
    url: 'https://example.com/files/final-mix.wav',
    name: 'final-mix.wav',
    mediaType: 'audio/wav',
  },
} satisfies Meta<typeof FileAttachmentChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnLight: Story = {
  args: {
    tone: 'onLight',
  },
};

export const OnDark: Story = {
  args: {
    tone: 'onDark',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const DocumentFile: Story = {
  args: {
    url: 'https://example.com/files/rider.pdf',
    name: 'rider.pdf',
    mediaType: 'application/pdf',
  },
};
