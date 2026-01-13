import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColumnToggle } from '@/components/admin/table/atoms/ColumnToggle';

describe('ColumnToggle', () => {
  it('renders correctly with label', () => {
    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={true}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Test Column')).toBeInTheDocument();
  });

  it('uses switch role with correct aria-checked for visible state', () => {
    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={true}
        onToggle={vi.fn()}
      />
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('uses switch role with correct aria-checked for hidden state', () => {
    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={false}
        onToggle={vi.fn()}
      />
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onToggle with correct arguments when clicked', () => {
    const handleToggle = vi.fn();

    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={true}
        onToggle={handleToggle}
      />
    );

    fireEvent.click(screen.getByRole('switch'));

    expect(handleToggle).toHaveBeenCalledTimes(1);
    expect(handleToggle).toHaveBeenCalledWith('test-column', false);
  });

  it('toggles from hidden to visible correctly', () => {
    const handleToggle = vi.fn();

    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={false}
        onToggle={handleToggle}
      />
    );

    fireEvent.click(screen.getByRole('switch'));

    expect(handleToggle).toHaveBeenCalledWith('test-column', true);
  });

  it('does not toggle when canToggle is false', () => {
    const handleToggle = vi.fn();

    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={true}
        canToggle={false}
        onToggle={handleToggle}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(handleToggle).not.toHaveBeenCalled();
    expect(toggle).toBeDisabled();
  });

  it('handles keyboard interaction with Enter key', () => {
    const handleToggle = vi.fn();

    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={true}
        onToggle={handleToggle}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.keyDown(toggle, { key: 'Enter' });

    expect(handleToggle).toHaveBeenCalledTimes(1);
    expect(handleToggle).toHaveBeenCalledWith('test-column', false);
  });

  it('handles keyboard interaction with Space key', () => {
    const handleToggle = vi.fn();

    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={false}
        onToggle={handleToggle}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.keyDown(toggle, { key: ' ' });

    expect(handleToggle).toHaveBeenCalledTimes(1);
    expect(handleToggle).toHaveBeenCalledWith('test-column', true);
  });

  it('does not trigger on keyboard when canToggle is false', () => {
    const handleToggle = vi.fn();

    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={true}
        canToggle={false}
        onToggle={handleToggle}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.keyDown(toggle, { key: 'Enter' });
    fireEvent.keyDown(toggle, { key: ' ' });

    expect(handleToggle).not.toHaveBeenCalled();
  });

  it('has correct aria-label for visible column', () => {
    render(
      <ColumnToggle
        id='test-column'
        label='Social Links'
        isVisible={true}
        onToggle={vi.fn()}
      />
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-label', 'Hide Social Links column');
  });

  it('has correct aria-label for hidden column', () => {
    render(
      <ColumnToggle
        id='test-column'
        label='Social Links'
        isVisible={false}
        onToggle={vi.fn()}
      />
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-label', 'Show Social Links column');
  });

  it('uses custom data-testid when provided', () => {
    render(
      <ColumnToggle
        id='test-column'
        label='Test Column'
        isVisible={true}
        onToggle={vi.fn()}
        data-testid='custom-testid'
      />
    );

    expect(screen.getByTestId('custom-testid')).toBeInTheDocument();
  });

  it('generates default data-testid from column id', () => {
    render(
      <ColumnToggle
        id='social-links'
        label='Social Links'
        isVisible={true}
        onToggle={vi.fn()}
      />
    );

    expect(
      screen.getByTestId('column-toggle-social-links')
    ).toBeInTheDocument();
  });
});
