import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

import { ProviderCopyButton } from './ProviderCopyButton';

type Props = ComponentProps<typeof ProviderCopyButton>;

function renderButton(overrides: Partial<Props> = {}) {
  const onCopy = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ProviderCopyButton
      testId='copy-spotify-release-1'
      path='/r/midnight-signal?utm_source=spotify'
      releaseTitle='Midnight Signal'
      providerLabel='Spotify'
      isCopied={false}
      isManual={false}
      onCopy={onCopy}
      {...overrides}
    />
  );
  return { ...view, onCopy };
}

describe('ProviderCopyButton certificate', () => {
  it('copies a detected provider link with its tracked path and label', async () => {
    const user = userEvent.setup();
    const { container, onCopy } = renderButton();

    const button = screen.getByRole('button', { name: 'Detected' });
    expect(button).toHaveAttribute(
      'data-url',
      'https://jov.ie/r/midnight-signal?utm_source=spotify'
    );
    await expectNoA11yViolations(container);

    await user.click(button);
    expect(onCopy).toHaveBeenCalledWith(
      '/r/midnight-signal?utm_source=spotify',
      'Midnight Signal – Spotify',
      'copy-spotify-release-1'
    );
  });

  it.each<[string, Partial<Props>, string]>([
    ['a manually added link', { isManual: true }, 'Custom'],
    ['a copied link', { isCopied: true }, 'Copied!'],
    ['a copied manual link', { isCopied: true, isManual: true }, 'Copied!'],
  ])('labels %s', async (_case, overrides, label) => {
    const user = userEvent.setup();
    const { container, onCopy } = renderButton(overrides);

    await user.click(screen.getByRole('button', { name: label }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('does nothing when there is no path to copy', async () => {
    const user = userEvent.setup();
    const { container, onCopy } = renderButton({ path: undefined });

    const button = screen.getByRole('button', { name: 'Detected' });
    expect(button).not.toHaveAttribute('data-url');
    await user.click(button);
    expect(onCopy).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
