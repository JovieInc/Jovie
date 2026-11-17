import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DspQuietRow } from './DspQuietRow';

const meta = {
  title: 'Molecules/Inspector/DspQuietRow',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: DspQuietRow,
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 1024] },
    jovie: { uncoveredProps: ['closedTabIndex', 'testId'] },
    // docs: destination rows preview on hover (left) and carry the
    // Open / Copy link / Copy Jovie link / Copy platform URI menu.
  },
  args: {
    label: 'Spotify',
    href: 'https://open.spotify.com/album/example',
    icon: <ProviderIcon provider='spotify' aria-hidden='true' />,
    onFind: fn(),
    findLabel: 'Find',
  },
} satisfies Meta<typeof DspQuietRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkedRow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Spotify' })).toHaveAttribute(
      'href',
      args.href
    );
    await expect(
      canvas.queryByRole('button', { name: 'Find' })
    ).not.toBeInTheDocument();
  },
};

export const LinkedRowWithUrl: Story = {
  args: { showUrl: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('link', { name: /^Spotify/ })
    ).toHaveTextContent('open.spotify.com/album/example');
  },
};

export const MissingWithFind: Story = {
  args: { href: null },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Find' }));
    await expect(args.onFind).toHaveBeenCalledOnce();
  },
};

export const MissingReadOnly: Story = {
  args: { href: null, onFind: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Spotify')).toBeVisible();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
  },
};

/** Both clipboard paths refuse in this isolated story; restore browser APIs afterward. */
export const ErrorClipboardRefused: Story = {
  // The catalog default /test is a public-profile route, which correctly
  // suppresses app feedback. This inspector error belongs to the app shell.
  parameters: { nextjs: { navigation: { pathname: '/app/library' } } },
  beforeEach: () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const originalExecCommand = document.execCommand;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error('Clipboard refused')),
      },
    });
    document.execCommand = () => false;
    return () => {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
      document.execCommand = originalExecCommand;
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actions = canvas.getByRole('button', {
      name: 'Destination actions for Spotify',
    });
    actions.focus();
    await userEvent.click(actions);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole('menuitem', { name: 'Copy Link' })
    );
    await waitFor(() =>
      expect(body.getByText('Could not copy to the clipboard')).toBeVisible()
    );
  },
};
