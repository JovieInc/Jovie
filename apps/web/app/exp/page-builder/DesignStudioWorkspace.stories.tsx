import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DesignStudioWorkspace } from '@/app/exp/page-builder/PageBuilderClient';

const meta: Meta<typeof DesignStudioWorkspace> = {
  title: 'Design Studio/Workspace',
  component: DesignStudioWorkspace,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  tags: ['autodocs'],
  argTypes: {
    mode: {
      control: { type: 'inline-radio' },
      options: ['sections', 'product', 'screenshots'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Sections: Story = {
  args: {
    mode: 'sections',
  },
};

export const Product: Story = {
  args: {
    mode: 'product',
  },
};

export const Screenshots: Story = {
  args: {
    mode: 'screenshots',
  },
};
