import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingTurnstile } from './OnboardingTurnstile';

/**
 * Rendered states of the invisible Turnstile host. Storybook bypasses the
 * Cloudflare widget, so these show the host wrapper around each instruction.
 */
const meta = {
  title: 'Onboarding/OnboardingTurnstile/States',
  component: OnboardingTurnstile,
  parameters: { layout: 'centered' },
  args: {
    onToken: () => undefined,
    onStateChange: () => undefined,
  },
} satisfies Meta<typeof OnboardingTurnstile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: a send is waiting for the silent token, so one instruction shows. */
export const LoadingWithInstruction: Story = {
  args: { instruction: 'Confirming you are human before sending.' },
};

/** Partial: no instruction and no signals, the bare invisible widget. */
export const PartialNoInstruction: Story = {};

/** Long content: an instruction that wraps over several lines. */
export const LongContentInstruction: Story = {
  args: {
    instruction:
      'We are confirming you are a real person before your first message goes out, which usually takes a second or two, so please keep this tab open while we finish.',
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-64'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: an Arabic instruction inside a right-to-left container. */
export const RtlInstruction: Story = {
  args: { instruction: 'نتحقق من أنك شخص حقيقي قبل إرسال رسالتك.' },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
