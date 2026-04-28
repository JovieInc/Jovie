import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineEditRow } from './InlineEditRow';

describe('InlineEditRow', () => {
  it('renders the label and value', () => {
    render(
      <InlineEditRow
        label='Title'
        value='Lost in the Light'
        onCommit={() => undefined}
      />
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
  });

  it('hides the edit pencil and skips hover surface when read-only', () => {
    render(<InlineEditRow label='ID' value='trk-1' />);
    expect(screen.queryByRole('button', { name: 'Edit ID' })).toBeNull();
  });

  it('shows the pencil on the row when editable', () => {
    render(
      <InlineEditRow label='Title' value='X' onCommit={() => undefined} />
    );
    expect(
      screen.getByRole('button', { name: 'Edit Title' })
    ).toBeInTheDocument();
  });

  it('enters edit mode when the row is clicked', () => {
    render(
      <InlineEditRow label='Title' value='X' onCommit={() => undefined} />
    );
    const row = screen.getByText('X').parentElement!;
    fireEvent.click(row);
    expect(
      screen.getByRole('textbox', { name: 'Edit Title' })
    ).toBeInTheDocument();
  });

  it('commits on Enter and fires onCommit with the new value', () => {
    const onCommit = vi.fn();
    render(<InlineEditRow label='Title' value='Old' onCommit={onCommit} />);
    fireEvent.click(screen.getByText('Old').parentElement!);
    const input = screen.getByRole('textbox', {
      name: 'Edit Title',
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('New');
  });

  it('cancels on Escape without firing onCommit', () => {
    const onCommit = vi.fn();
    render(<InlineEditRow label='Title' value='Old' onCommit={onCommit} />);
    fireEvent.click(screen.getByText('Old').parentElement!);
    const input = screen.getByRole('textbox', {
      name: 'Edit Title',
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    // After cancel, the read-only row should be back
    expect(screen.queryByRole('textbox', { name: 'Edit Title' })).toBeNull();
  });

  it('skips onCommit when the value is unchanged', () => {
    const onCommit = vi.fn();
    render(<InlineEditRow label='Title' value='Same' onCommit={onCommit} />);
    fireEvent.click(screen.getByText('Same').parentElement!);
    const input = screen.getByRole('textbox', {
      name: 'Edit Title',
    }) as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('applies mono tone classes', () => {
    render(
      <InlineEditRow
        label='Key'
        value='C#m'
        valueTone='mono'
        onCommit={() => undefined}
      />
    );
    expect(screen.getByText('C#m').className).toContain('font-mono');
  });

  it('applies tabular tone classes', () => {
    render(
      <InlineEditRow
        label='BPM'
        value='128'
        valueTone='tabular'
        onCommit={() => undefined}
      />
    );
    expect(screen.getByText('128').className).toContain('tabular-nums');
  });
});
