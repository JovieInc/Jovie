import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ClaimHandleForm } from './ClaimHandleForm';

const meta = {
  title: 'Marketing/Forms/ClaimHandleForm/States',
  component: ClaimHandleForm,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WidthDecorator(Story) {
      return (
        <div className='w-full max-w-md p-4'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ClaimHandleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function typeHandle(canvasElement: HTMLElement, value: string) {
  const canvas = within(canvasElement);
  const input = canvas.getByRole('textbox', { name: 'Choose Your Handle' });
  await userEvent.type(input, value);
  return { canvas, input };
}

/** Empty: nothing typed, the helper text stays blank. */
export const EmptyHandle: Story = {};

/** Error: a handle that is too short shows the validation message. */
export const ErrorHandleTooShort: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, input } = await typeHandle(canvasElement, 'ab');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(
      canvas.getByText(/Handle must be at least 3 characters/i)
    ).toBeVisible();
  },
};

/** Long content: a very long handle stays inside the field. */
export const LongContentHandle: Story = {
  play: async ({ canvasElement }) => {
    await typeHandle(
      canvasElement,
      'averylonghandlethatkeepsgoingandgoingpastthefield'
    );
  },
};

/** Offline: the availability check cannot reach the network. */
export const OfflineAvailabilityCheck: Story = {
  play: async ({ canvasElement }) => {
    const original = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.reject(new TypeError('offline'))) as typeof fetch;
    try {
      const { input } = await typeHandle(canvasElement, 'newartist');
      await expect(input).toHaveValue('newartist');
    } finally {
      globalThis.fetch = original;
    }
  },
};

/** Right to left: the field under an Arabic document direction. */
export const RtlOverflow: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
