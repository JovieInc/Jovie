import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { ChatDropZoneOverlay } from './ChatDropZoneOverlay';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { readonly children: React.ReactNode }) =>
    children,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      readonly initial?: unknown;
      readonly animate?: unknown;
      readonly exit?: unknown;
      readonly transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

describe('ChatDropZoneOverlay', () => {
  it('announces the temporary drop target without replacing chat semantics', () => {
    fastRender(<ChatDropZoneOverlay isDragOver pendingFiles={[]} />);

    const status = screen.getByRole('status', {
      name: 'Drop Files To Attach To This Thread',
    });

    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('data-transient-surface', 'file-drop');
  });

  it('does not mount when no file drag is active', () => {
    fastRender(<ChatDropZoneOverlay isDragOver={false} pendingFiles={[]} />);

    expect(screen.queryByRole('status')).toBeNull();
  });
});
