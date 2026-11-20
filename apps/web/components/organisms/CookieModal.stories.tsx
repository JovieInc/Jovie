import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  blockStoredConsentRead,
  setStorybookConsentSave,
} from '@/.storybook/cookie-consent-mock';
import { CookieModal } from './CookieModal';

const meta: Meta<typeof CookieModal> = {
  title: 'Organisms/CookieModal',
  component: CookieModal,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      // Internal category metadata owns the disabled Essential switch; it is
      // not a CookieModal prop that Storybook can control.
      uncoveredProps: ['disabled'],
    },
    chromatic: {
      viewports: [390, 1024],
    },
  },
  args: {
    open: true,
    onClose: fn(),
    onSave: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Preferences: Story = {};

/** The consent save fails; the dialog stays open and reports it. */
export const ErrorSaveFailed: Story = {
  beforeEach: () => setStorybookConsentSave('error'),
  play: async ({ args, canvasElement }) => {
    // The dialog portals to document.body, outside the story canvas.
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Save Preferences' })
    );
    await expect(await page.findByRole('alert')).toHaveTextContent(
      'We could not save preferences.'
    );
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

/**
 * The browser denies site storage, so the saved choice cannot be read; the
 * optional categories fall back to off instead of assuming consent.
 */
export const PermissionDeniedStorageBlocked: Story = {
  beforeEach: () => blockStoredConsentRead(),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole('switch', { name: 'Analytics' })
    ).not.toBeChecked();
    await expect(
      page.getByRole('switch', { name: 'Marketing' })
    ).not.toBeChecked();
  },
};

/**
 * The dialog portals to document.body, so it takes its direction from the
 * document like a real right-to-left app; the story sets it on the iframe.
 */
function DocumentDirectionRtl({ children }: { readonly children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('dir');
    root.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previous);
    };
  }, []);
  return <div dir='rtl'>{children}</div>;
}

export const Rtl: Story = {
  decorators: [
    Story => (
      <DocumentDirectionRtl>
        <Story />
      </DocumentDirectionRtl>
    ),
  ],
};
