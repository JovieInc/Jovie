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

/** Global Privacy Control locks the switch on. The browser signal is the restriction. */
export const PermissionDenied: Story = {
  beforeEach: () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    });
    return () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: false,
      });
    };
  },
};

/** The dialog keeps the switch and status readable when the page direction is right to left. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
