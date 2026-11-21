import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CopyLinkInput } from './CopyLinkInput';

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CopyLinkInput', () => {
  it('shows the url in a read-only, labelled input and stays axe-clean', async () => {
    const { container } = render(<CopyLinkInput url='https://jov.ie/tim' />);
    const input = screen.getByRole('textbox', { name: 'URL To Copy' });
    expect(input).toHaveValue('https://jov.ie/tim');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveClass('system-b-copy-link-input');
    expect(input).toHaveAttribute('data-size', 'md');
    await expectNoA11yViolations(container);
  });

  it('keeps the value and focus across a rerender, typing and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CopyLinkInput url='https://jov.ie/tim' />);
    const input = screen.getByRole('textbox', { name: 'URL To Copy' });
    await user.type(input, 'extra');
    rerender(<CopyLinkInput url='https://jov.ie/tim' />);
    expect(screen.getByRole('textbox')).toHaveValue('https://jov.ie/tim');
    expect(screen.getByRole('textbox')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox')).toHaveValue('https://jov.ie/tim');
  });

  it('shows a display value but copies the full url', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const onCopy = vi.fn();
    render(
      <CopyLinkInput
        url='https://jov.ie/tim?utm_source=share'
        displayValue='jov.ie/tim'
        onCopy={onCopy}
      />
    );
    expect(screen.getByRole('textbox')).toHaveValue('jov.ie/tim');
    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    expect(writeText).toHaveBeenCalledWith(
      'https://jov.ie/tim?utm_source=share'
    );
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Copied to clipboard' })
    ).toHaveAttribute('data-copied', 'true');
  });

  it('selects the text on click and can stop propagation to a parent row', async () => {
    const user = userEvent.setup();
    const bodyClick = vi.fn();
    document.body.addEventListener('click', bodyClick);
    render(
      <CopyLinkInput url='https://jov.ie/tim' stopPropagation size='sm' />
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toHaveAttribute('data-size', 'sm');
    await user.click(input);
    document.body.removeEventListener('click', bodyClick);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('https://jov.ie/tim'.length);
    expect(bodyClick).not.toHaveBeenCalled();
  });

  it('keeps the copy button idle and logs when the clipboard is unavailable offline', async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubClipboard(() => Promise.reject(new Error('Offline')));
    const { container } = render(<CopyLinkInput url='https://jov.ie/tim' />);
    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    expect(error).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Copy to clipboard' })
    ).not.toHaveAttribute('data-copied');
    await expectNoA11yViolations(container);
  });

  it('renders empty and right-to-left values axe-clean', async () => {
    const empty = render(<CopyLinkInput url='' />);
    expect(screen.getByRole('textbox')).toHaveValue('');
    await expectNoA11yViolations(empty.container);
    empty.unmount();
    const rtl = render(
      <CopyLinkInput url='https://jov.ie/ar' displayValue='jov.ie/فرقة' />
    );
    expect(screen.getByRole('textbox')).toHaveValue('jov.ie/فرقة');
    await expectNoA11yViolations(rtl.container);
  });
});
