import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ShareableLinkRow } from './ShareableLinkRow';

const writeText = vi.fn().mockResolvedValue(undefined);

describe('ShareableLinkRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // defineProperty, not assignment: userEvent.setup() leaves a getter-only
    // clipboard stub on navigator after its tests.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('keeps a single visible open affordance and stops row clicks', async () => {
    const onOpen = vi.fn();
    const { container } = render(
      <ShareableLinkRow
        url='https://jov.ie/tim'
        density='rail'
        onOpen={onOpen}
        testId='shareable-link-row'
      />
    );

    fireEvent.click(screen.getByTitle('Open link'));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button', { name: 'Open link' })).toHaveLength(
      1
    );
    await expectNoA11yViolations(container);
  });

  it('supports compact and table density without changing the visible URL', () => {
    const { rerender } = render(
      <ShareableLinkRow
        url='https://jov.ie/tim'
        density='compact'
        testId='row'
      />
    );
    expect(screen.getByTestId('row')).toHaveClass('h-6');
    expect(screen.getByText('jov.ie/tim')).toBeInTheDocument();

    rerender(
      <ShareableLinkRow url='https://jov.ie/tim' density='table' testId='row' />
    );
    expect(screen.getByTestId('row')).toHaveClass('h-8');
  });

  it('keeps compact density copy/open targets at the 24px minimum', () => {
    render(
      <ShareableLinkRow
        url='https://jov.ie/tim'
        density='compact'
        testId='row'
      />
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveClass(
      'h-6',
      'w-6'
    );
  });

  it('keeps table density copy/open targets on the 24px icon-button step', () => {
    render(
      <ShareableLinkRow url='https://jov.ie/tim' density='table' testId='row' />
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveClass(
      'h-6',
      'w-6'
    );
  });

  it('locks rail density to the 32px desktop control contract', () => {
    render(
      <ShareableLinkRow url='https://jov.ie/tim' density='rail' testId='row' />
    );
    expect(screen.getByTestId('row')).toHaveClass('h-8');
  });

  it('flat surface adds no horizontal inset and uses body text size', async () => {
    const { container } = render(
      <ShareableLinkRow
        url='https://jov.ie/tim'
        density='compact'
        surface='flat'
        testId='row'
      />
    );
    expect(screen.getByTestId('row')).toHaveClass('px-0');
    expect(screen.getByText('jov.ie/tim')).toHaveClass('text-xs');
    await expectNoA11yViolations(container);
  });

  it('announces Copied after a successful copy, then resets', async () => {
    // fireEvent keeps the navigator.clipboard stub above; userEvent.setup()
    // would install its own clipboard.
    const onCopySuccess = vi.fn();
    const { container } = render(
      <ShareableLinkRow
        url='https://jov.ie/tim'
        copiedDuration={50}
        onCopySuccess={onCopySuccess}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith('https://jov.ie/tim');
    const copied = await screen.findByRole('button', { name: 'Copied' });
    expect(copied).toHaveClass('text-success');
    expect(onCopySuccess).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible()
    );
  });

  it('reports a rejected copy without claiming success', async () => {
    const user = userEvent.setup();
    const onCopySuccess = vi.fn();
    const onCopyError = vi.fn();
    const { container } = render(
      <ShareableLinkRow
        url='https://jov.ie/tim'
        onCopy={() => Promise.reject(new Error('denied'))}
        onCopySuccess={onCopySuccess}
        onCopyError={onCopyError}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(onCopyError).toHaveBeenCalledOnce());
    expect(onCopySuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left values named and truncated', async () => {
    const longUrl =
      'https://jov.ie/the-midnight-collective-official/releases/a-very-long-release-title-deluxe-edition';
    const { container, rerender } = render(
      <ShareableLinkRow url={longUrl} testId='row' />
    );
    const value = screen.getByTitle(longUrl);
    expect(value).toHaveClass('min-w-0', 'truncate');
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl'>
        <ShareableLinkRow
          url='https://jov.ie/amr'
          displayValue='jov.ie/عمرو-دياب'
          copyButtonTitle='نسخ الرابط'
          openButtonTitle='فتح الرابط'
        />
      </div>
    );
    expect(screen.getByText('jov.ie/عمرو-دياب')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'نسخ الرابط' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
