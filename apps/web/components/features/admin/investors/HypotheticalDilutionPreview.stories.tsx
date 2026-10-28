import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HypotheticalDilutionPreview } from './HypotheticalDilutionPreview';

const meta: Meta<typeof HypotheticalDilutionPreview> = {
  title: 'Features/Admin/Investors/HypotheticalDilutionPreview',
  component: HypotheticalDilutionPreview,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof HypotheticalDilutionPreview>;

/** Starts empty. Use the disclosure and labeled synthetic example to explore. */
export const Default: Story = {};
