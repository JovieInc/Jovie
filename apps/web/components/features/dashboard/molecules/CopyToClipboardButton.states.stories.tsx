import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CopyToClipboardButton } from './CopyToClipboardButton';

type WriteText = (text: string) => Promise<void>;

/** Replace the browser clipboard (and the execCommand fallback) for one story. */
function stubClipboard(writeText: WriteText, execCommandResult = false) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const originalExecCommand = document.execCommand;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  document.execCommand = () => execCommandResult;
  return () => {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    document.execCommand = originalExecCommand;
  };
}

/**
 * State coverage for the profile URL copy button. Same args as the canonical
 * stories; the pending and failed stories replace the clipboard and press the
 * button so the in-button state is visible.
 */
const meta: Meta<typeof CopyToClipboardButton> = {
  title: 'Dashboard/Molecules/CopyToClipboardButton States',
  component: CopyToClipboardButton,
  parameters: {
    layout: 'padded',
  },
  args: {
    relativePath: '/example-handle',
    idleLabel: 'Copy URL',
    successLabel: 'Copied!',
    errorLabel: 'Failed to copy',
    iconName: undefined,
  },
};

export default meta;
type Story = StoryObj<typeof CopyToClipboardButton>;

/** Loading: the clipboard write never settles, so the button stays pending. */
export const LoadingCopyPending: Story = {
  beforeEach: () => stubClipboard(() => new Promise<void>(() => {})),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Copy URL' }));
    await waitFor(() =>
      expect(canvas.getByRole('button')).toHaveAttribute('aria-busy', 'true')
    );
  },
};

/** Error: the clipboard and its fallback both refuse, so the button reports failure. */
export const ErrorClipboardRefused: Story = {
  beforeEach: () =>
    stubClipboard(() => Promise.reject(new Error('Clipboard blocked'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Copy URL' }));
    await waitFor(() =>
      expect(canvas.getByRole('button')).toHaveAccessibleName(/Failed to copy/)
    );
  },
};

/** Error on the icon-only variant, which also announces the failure politely. */
export const ErrorIconOnly: Story = {
  args: { iconName: 'Copy' },
  beforeEach: () =>
    stubClipboard(() => Promise.reject(new Error('Clipboard blocked'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await waitFor(() =>
      expect(canvasElement.querySelector('output')).toHaveTextContent(
        'Failed to copy profile URL'
      )
    );
  },
};

/** Long content: a long idle label on the text button. */
export const LongContentLabel: Story = {
  args: {
    idleLabel: 'Copy your public profile link to share it anywhere',
  },
};

/** Right-to-left: an Arabic label inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    idleLabel: 'نسخ الرابط',
    successLabel: 'تم النسخ',
    errorLabel: 'تعذر النسخ',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
