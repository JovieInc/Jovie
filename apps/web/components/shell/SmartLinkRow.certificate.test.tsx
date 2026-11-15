import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SmartLinkRow } from './SmartLinkRow';

describe('SmartLinkRow certificate', () => {
  it('shows the URL with only a copy action when there is no open handler, axe-clean', async () => {
    const { container } = render(<SmartLinkRow url='jov.ie/example' />);
    expect(screen.getByText('jov.ie/example')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy smart link' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open smart link' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('calls the copy and open handlers, axe-clean', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <SmartLinkRow url='jov.ie/take-me-over' onCopy={onCopy} onOpen={onOpen} />
    );
    await user.click(screen.getByRole('button', { name: 'Open smart link' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Copy smart link' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long URL in an RTL drawer axe-clean', async () => {
    const url =
      'jov.ie/the-extremely-long-collective-name/a-song-title-so-long-it-needs-to-truncate';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SmartLinkRow url={url} onOpen={vi.fn()} />
      </div>
    );
    expect(screen.getByText(url)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
