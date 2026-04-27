import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PickerToggle } from './PickerToggle';

describe('PickerToggle', () => {
  it('renders the on label and emerald dot when on', () => {
    const { container } = render(
      <PickerToggle
        on
        onClick={() => undefined}
        onLabel='Push-to-talk on'
        offLabel='Push-to-talk off'
      />
    );
    expect(screen.getByText('Push-to-talk on')).toBeInTheDocument();
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot?.className).toContain('emerald');
  });

  it('renders the off label and muted dot when off', () => {
    const { container } = render(
      <PickerToggle
        on={false}
        onClick={() => undefined}
        onLabel='Push-to-talk on'
        offLabel='Push-to-talk off'
      />
    );
    expect(screen.getByText('Push-to-talk off')).toBeInTheDocument();
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot?.className).not.toContain('emerald');
  });

  it('exposes aria-pressed reflecting the on state', () => {
    render(
      <PickerToggle on onClick={() => undefined} onLabel='X' offLabel='Y' />
    );
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument();
  });

  it('renders an optional shortcut on the right', () => {
    render(
      <PickerToggle
        on
        onClick={() => undefined}
        onLabel='X'
        offLabel='Y'
        shortcut='⌘J'
      />
    );
    expect(screen.getByText('⌘J')).toBeInTheDocument();
  });

  it('fires onClick when the row is clicked', () => {
    const onClick = vi.fn();
    render(
      <PickerToggle on={false} onClick={onClick} onLabel='X' offLabel='Y' />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
