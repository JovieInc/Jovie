import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareableLinkRow } from './ShareableLinkRow';

const writeText = vi.fn().mockResolvedValue(undefined);

describe('ShareableLinkRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it('keeps a single visible open affordance and stops row clicks', () => {
    const onOpen = vi.fn();
    render(
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
});
