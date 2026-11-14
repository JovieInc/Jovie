import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CopyableMonospaceCell } from './CopyableMonospaceCell';

describe('CopyableMonospaceCell certificate', () => {
  let writeText: ReturnType<typeof vi.fn>;

  // userEvent installs its own clipboard on setup, so the spy goes on after.
  function setupUser(options?: Parameters<typeof userEvent.setup>[0]) {
    const user = userEvent.setup(options);
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    return user;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies the value without bubbling to the row and announces it', async () => {
    const user = setupUser();
    const onRowClick = vi.fn();
    const { container } = render(
      // biome-ignore lint/a11y/noStaticElementInteractions: a table row stand-in that must not receive the copy click
      // biome-ignore lint/a11y/useKeyWithClickEvents: the parent only records bubbling
      <div onClick={onRowClick}>
        <CopyableMonospaceCell value='USRC17607839' label='ISRC' />
      </div>
    );

    const button = screen.getByRole('button', {
      name: 'Copy ISRC: USRC17607839',
    });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('title', 'Copy ISRC');

    await user.click(button);
    expect(writeText).toHaveBeenCalledWith('USRC17607839');
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByText('ISRC copied')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('clears the copied announcement after two seconds', async () => {
    setupUser();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<CopyableMonospaceCell value='USRC17607839' label='ISRC' />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy ISRC: USRC17607839' })
    );
    expect(writeText).toHaveBeenCalledWith('USRC17607839');
    expect(screen.getByText('ISRC copied')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByText('ISRC copied')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('ISRC copied')).not.toBeInTheDocument();
  });

  it('copies from the keyboard in the small size', async () => {
    const user = setupUser();
    const { container } = render(
      <CopyableMonospaceCell value='00602577291234' label='UPC' size='sm' />
    );

    const button = screen.getByRole('button', {
      name: 'Copy UPC: 00602577291234',
    });
    expect(button).toHaveClass('h-5', 'text-3xs');

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(writeText).toHaveBeenCalledWith('00602577291234');
    await expectNoA11yViolations(container);
  });

  it('shows a dash and no copy control when there is no value', async () => {
    const { container } = render(
      <CopyableMonospaceCell value={undefined} label='ISRC' />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toHaveClass('text-tertiary-token');
    await expectNoA11yViolations(container);
  });

  it('truncates a long id to its maximum width and stays axe-clean right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CopyableMonospaceCell
          value='USRC17607839-EXTENDED-CATALOG-ID-FROM-DISTRIBUTOR'
          label='Catalog ID'
          maxWidth={80}
        />
      </div>
    );

    const value = screen.getByText(
      'USRC17607839-EXTENDED-CATALOG-ID-FROM-DISTRIBUTOR'
    );
    expect(value).toHaveClass('truncate');
    expect(value).toHaveStyle({ maxWidth: '80px' });
    await expectNoA11yViolations(container);
  });
});
