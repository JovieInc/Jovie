import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DocToolbar } from './DocToolbar';

const meta = {
  title: 'Molecules/DocToolbar',
  component: DocToolbar,
  parameters: {
    layout: 'centered',
  },
  args: {
    pdfTitle: 'Jovie Terms of Service',
  },
} satisfies Meta<typeof DocToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: /print/i })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: /download pdf/i })
    ).toBeInTheDocument();
  },
};

export const LongTitle: Story = {
  args: {
    pdfTitle: 'Jovie Data Processing Addendum and Sub-processor List',
  },
};

export const PrintInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const printButton = canvas.getByRole('button', { name: /print/i });
    const originalPrint = globalThis.print;
    globalThis.print = () => {};
    await userEvent.click(printButton);
    globalThis.print = originalPrint;
  },
};
