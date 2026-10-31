import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PrivacyChoices } from './PrivacyChoices';

const meta = {
  title: 'Organisms/PrivacyChoices',
  component: PrivacyChoices,
  args: { onClose: () => undefined },
} satisfies Meta<typeof PrivacyChoices>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
