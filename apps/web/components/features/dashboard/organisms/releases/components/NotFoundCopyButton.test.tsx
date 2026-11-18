import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NotFoundCopyButton } from './NotFoundCopyButton';

describe('NotFoundCopyButton certificate', () => {
  it('copies the release smart link from the dash fallback', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <NotFoundCopyButton
        testId='copy-not-found-release-1'
        releaseTitle='Midnight Signal'
        smartLinkPath='/r/midnight-signal'
        isCopied={false}
        onCopy={onCopy}
      />
    );

    const button = screen.getByRole('button', { name: '—' });
    await expectNoA11yViolations(container);

    await user.click(button);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith(
      '/r/midnight-signal',
      'Midnight Signal smart link',
      'copy-not-found-release-1'
    );
  });

  it('copies again from the keyboard while showing the copied confirmation', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <NotFoundCopyButton
        testId='copy-not-found-release-2'
        releaseTitle='Night Drive'
        smartLinkPath='/r/night-drive'
        isCopied
        onCopy={onCopy}
      />
    );

    const button = screen.getByRole('button', { name: 'Copied!' });
    expect(screen.queryByText('—')).toBeNull();
    await expectNoA11yViolations(container);

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onCopy).toHaveBeenCalledWith(
      '/r/night-drive',
      'Night Drive smart link',
      'copy-not-found-release-2'
    );
  });
});
