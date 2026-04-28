import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartLinkRow } from './SmartLinkRow';

describe('SmartLinkRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the URL', () => {
    render(<SmartLinkRow url='jov.ie/example' />);
    expect(screen.getByText('jov.ie/example')).toBeInTheDocument();
  });

  it('hides the open button when no onOpen handler is provided', () => {
    render(<SmartLinkRow url='jov.ie/x' />);
    expect(
      screen.queryByRole('button', { name: 'Open smart link' })
    ).toBeNull();
  });

  it('fires the open handler when the open button is clicked', () => {
    const onOpen = vi.fn();
    render(<SmartLinkRow url='jov.ie/x' onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open smart link' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('flips to the copied label for 1.2s after a click', () => {
    render(<SmartLinkRow url='jov.ie/x' />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy smart link' }));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(
      screen.getByRole('button', { name: 'Copy smart link' })
    ).toBeInTheDocument();
  });

  it('uses a custom onCopy handler when provided', () => {
    const onCopy = vi.fn();
    render(<SmartLinkRow url='jov.ie/x' onCopy={onCopy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy smart link' }));
    expect(onCopy).toHaveBeenCalledOnce();
  });
});
