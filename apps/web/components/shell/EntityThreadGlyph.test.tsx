import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntityThreadGlyph } from './EntityThreadGlyph';

describe('EntityThreadGlyph', () => {
  it('exposes the thread title via sr-only', () => {
    render(
      <EntityThreadGlyph
        threadTitle='Generating lyric video'
        onOpen={() => undefined}
      />
    );
    expect(screen.getByText('Generating lyric video')).toBeInTheDocument();
  });

  it('fires onOpen on click and stops propagation', () => {
    const onOpen = vi.fn();
    const onParentClick = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: test harness — verifying the inner click does not bubble; production callers wrap the glyph in already-interactive rows
      // biome-ignore lint/a11y/useKeyWithClickEvents: test harness — same reason
      <div data-testid='row-parent' onClick={onParentClick}>
        <EntityThreadGlyph threadTitle='t' onOpen={onOpen} />
      </div>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Open running thread' })
    );
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
