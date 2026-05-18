import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getShellListRowFrameClassName,
  ShellListRowButton,
  ShellListRowFrame,
} from './ShellListRowFrame';

describe('ShellListRowFrame', () => {
  it('uses shell row selection tokens for self-managed rows', () => {
    const { getByTestId } = render(
      <ShellListRowFrame
        data-testid='row'
        isSelected
        interactive
        className='h-14'
      />
    );

    const row = getByTestId('row');
    expect(row).toHaveAttribute('data-shell-list-row', 'true');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row.className).toContain('bg-(--linear-row-selected)');
    expect(row.className).toContain('cursor-pointer');
    expect(row.className).toContain('h-14');
  });

  it('supports embedded rows that inherit focus from the table row wrapper', () => {
    const className = getShellListRowFrameClassName({
      interaction: 'task-row-group',
      isSelected: false,
    });

    expect(className).toContain('group-hover/task-row:bg-(--linear-row-hover)');
    expect(className).toContain('group-focus-visible/task-row:bg-');
    expect(className).not.toContain('cursor-pointer');
  });

  it('uses button semantics for clickable shell rows', () => {
    const { getByTestId } = render(
      <ShellListRowButton data-testid='row-button' isSelected className='px-3'>
        Open
      </ShellListRowButton>
    );

    const row = getByTestId('row-button');
    expect(row.tagName).toBe('BUTTON');
    expect(row).toHaveAttribute('type', 'button');
    expect(row).toHaveAttribute('data-shell-list-row', 'true');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row.className).toContain('bg-(--linear-row-selected)');
    expect(row.className).toContain('cursor-pointer');
    expect(row.className).toContain('px-3');
  });
});
