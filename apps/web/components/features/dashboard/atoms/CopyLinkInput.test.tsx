import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CopyLinkInput } from './CopyLinkInput';

describe('CopyLinkInput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies the real url, not the display value, and confirms it', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const { container } = render(
      <CopyLinkInput
        url='https://jov.ie/tim?utm_source=share'
        displayValue='jov.ie/tim'
        onCopy={onCopy}
      />
    );

    expect(screen.getByRole('textbox', { name: 'URL To Copy' })).toHaveValue(
      'jov.ie/tim'
    );
    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }));

    expect(writeText).toHaveBeenCalledWith(
      'https://jov.ie/tim?utm_source=share'
    );
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', { name: 'Copied to clipboard' })
    ).toHaveAttribute('data-copied', 'true');
    await expectNoA11yViolations(container);
  });

  it('keeps the read-only value and focus through typing, a rerender and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CopyLinkInput url='https://jov.ie/tim' />);
    const field = screen.getByRole('textbox', { name: 'URL To Copy' });

    await user.click(field);
    await user.type(field, 'ignored');
    rerender(<CopyLinkInput url='https://jov.ie/tim' size='sm' />);
    await user.keyboard('{Escape}');

    expect(field).toHaveValue('https://jov.ie/tim');
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('readonly');
  });

  it('stays idle and logs when the clipboard write fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied')
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onCopy = vi.fn();
    render(<CopyLinkInput url='https://jov.ie/tim' onCopy={onCopy} />);

    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }));

    expect(onCopy).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Copy to clipboard' })
    ).not.toHaveAttribute('data-copied');
  });

  it('stops click bubbling when asked and selects the url on input click', async () => {
    const user = userEvent.setup();
    const parent = vi.fn();
    document.body.addEventListener('click', parent);
    render(<CopyLinkInput url='https://jov.ie/tim' stopPropagation />);

    await user.click(screen.getByRole('textbox', { name: 'URL To Copy' }));
    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    document.body.removeEventListener('click', parent);

    expect(parent).not.toHaveBeenCalled();
  });

  it('sizes the field by the size prop and renders an empty url axe-clean', async () => {
    const { container, rerender } = render(<CopyLinkInput url='' size='sm' />);
    expect(screen.getByRole('textbox')).toHaveClass('h-7');
    rerender(<CopyLinkInput url='' size='md' />);
    expect(screen.getByRole('textbox')).toHaveClass('h-9');
    await expectNoA11yViolations(container);
  });
});
