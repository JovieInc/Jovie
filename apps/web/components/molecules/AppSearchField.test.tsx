import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppSearchField } from './AppSearchField';

describe('AppSearchField', () => {
  it('keeps the container ring keyboard-only while preserving input focus feedback', () => {
    const { container } = render(
      <AppSearchField ariaLabel='Search library' onChange={vi.fn()} value='' />
    );

    expect(
      screen.getByRole('searchbox', { name: 'Search library' })
    ).toBeVisible();
    expect(container.firstElementChild).toHaveClass(
      'focus-within:border-(--linear-border-focus)',
      'focus-within:bg-surface-0',
      'has-[:focus-visible]:ring-2',
      'has-[:focus-visible]:ring-ring/14'
    );
    expect(container.firstElementChild?.className).not.toContain(
      'focus-within:ring-'
    );
  });

  it.each(['pointer', 'keyboard'])(
    'returns focus to the input after %s clear and supports continued typing',
    async mode => {
      const user = userEvent.setup();
      const onClear = vi.fn();
      function SearchHarness() {
        const [value, setValue] = useState('Release');
        return (
          <AppSearchField
            ariaLabel='Search library'
            value={value}
            onChange={setValue}
            onClear={onClear}
          />
        );
      }
      render(<SearchHarness />);
      const input = screen.getByRole('searchbox', { name: 'Search library' });
      const clear = screen.getByRole('button', { name: 'Clear search' });
      if (mode === 'keyboard') {
        await user.tab();
        expect(input).toHaveFocus();
        await user.tab();
        expect(clear).toHaveFocus();
        await user.keyboard('{Enter}');
      } else {
        await user.click(clear);
      }
      expect(input).toHaveFocus();
      expect(input).toHaveValue('');
      expect(
        screen.queryByRole('button', { name: 'Clear search' })
      ).not.toBeInTheDocument();
      expect(onClear).toHaveBeenCalledOnce();
      await user.keyboard('Artwork');
      expect(input).toHaveValue('Artwork');
    }
  );

  it('preserves caller refs and allows onClear to deliberately move focus', async () => {
    const user = userEvent.setup();
    const inputRef = createRef<HTMLInputElement>();
    const nextRef = createRef<HTMLButtonElement>();
    const view = render(
      <>
        <AppSearchField
          ariaLabel='Search library'
          value='Release'
          onChange={vi.fn()}
          inputRef={inputRef}
          onClear={() => nextRef.current?.focus()}
        />
        <button type='button' ref={nextRef}>
          Next Action
        </button>
      </>
    );
    expect(inputRef.current).toBe(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(nextRef.current).toHaveFocus();
    view.unmount();
    expect(inputRef.current).toBeNull();
  });

  it('preserves callback ref cleanup and explicit clear visibility', () => {
    const cleanup = vi.fn();
    const inputRef = vi.fn(() => cleanup);
    const view = render(
      <AppSearchField
        ariaLabel='Search library'
        value='Release'
        onChange={vi.fn()}
        inputRef={inputRef}
        showClearButton={false}
      />
    );
    expect(inputRef).toHaveBeenCalledWith(screen.getByRole('searchbox'));
    expect(
      screen.queryByRole('button', { name: 'Clear search' })
    ).not.toBeInTheDocument();
    view.unmount();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
