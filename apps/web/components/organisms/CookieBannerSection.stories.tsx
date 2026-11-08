import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  blockStoredConsentRead,
  type StorybookConsentSaveOutcome,
  setStorybookConsentSave,
} from '@/.storybook/cookie-consent-mock';
import { CookieBannerSection } from './CookieBannerSection';

function RequiredConsentFixture() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.cookie = 'jv_cc_required=1; path=/';
    localStorage.removeItem('jv_cc');
    setReady(true);

    return () => {
      document.cookie = 'jv_cc_required=; Max-Age=0; path=/';
      document.documentElement.style.removeProperty('--cookie-banner-h');
    };
  }, []);

  return ready ? <CookieBannerSection /> : null;
}

const meta: Meta<typeof CookieBannerSection> = {
  title: 'Organisms/CookieBannerSection',
  component: CookieBannerSection,
  parameters: {
    layout: 'fullscreen',
    chromatic: {
      viewports: [320, 390],
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/tim',
        query: {},
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AboveProfileNavigation: Story = {
  render: () => <RequiredConsentFixture />,
};

function saveOutcome(outcome: StorybookConsentSaveOutcome) {
  return () => setStorybookConsentSave(outcome);
}

async function choose(canvasElement: HTMLElement, name: string) {
  const canvas = within(canvasElement);
  const action = await canvas.findByRole('button', { name });
  await userEvent.click(action);
  return canvas;
}

/** Accept all is pressed while the consent cookie save is still in flight. */
export const LoadingSavingChoice: Story = {
  render: () => <RequiredConsentFixture />,
  beforeEach: saveOutcome('pending'),
  play: async ({ canvasElement }) => {
    const canvas = await choose(canvasElement, 'Accept all');
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Accept all' })).toBeDisabled()
    );
    await expect(
      canvas.getByRole('button', { name: 'Reject all' })
    ).toBeDisabled();
  },
};

/** The server rejects the consent save; the card stays and says so. */
export const ErrorSaveFailed: Story = {
  render: () => <RequiredConsentFixture />,
  beforeEach: saveOutcome('error'),
  play: async ({ canvasElement }) => {
    const canvas = await choose(canvasElement, 'Accept all');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'We could not save preferences.'
    );
    await expect(
      canvas.getByRole('button', { name: 'Accept all' })
    ).toBeEnabled();
  },
};

/** The visitor is offline, so the save request never reaches the server. */
export const OfflineSaveFailed: Story = {
  render: () => <RequiredConsentFixture />,
  beforeEach: saveOutcome('offline'),
  play: async ({ canvasElement }) => {
    const canvas = await choose(canvasElement, 'Reject all');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Check your connection and try again.'
    );
  },
};

/**
 * The browser denies site storage, so a past choice cannot be read. The card
 * fails closed and asks again rather than assuming consent.
 */
export const PermissionDeniedStorageBlocked: Story = {
  render: () => <RequiredConsentFixture />,
  beforeEach: () => blockStoredConsentRead(),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByTestId('cookie-banner')
    ).toBeVisible();
  },
};

/**
 * The card is fixed to the viewport, so it takes its direction from the
 * document like a real right-to-left page.
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
  render: () => (
    <DocumentDirectionRtl>
      <RequiredConsentFixture />
    </DocumentDirectionRtl>
  ),
};
