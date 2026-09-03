import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { ChatDropZoneOverlay } from './ChatDropZoneOverlay';

describe('ChatDropZoneOverlay', () => {
  it('announces the temporary drop target without replacing chat semantics', () => {
    fastRender(<ChatDropZoneOverlay isDragOver pendingFiles={[]} />);

    const status = screen.getByRole('status', {
      name: 'Drop Files To Attach To This Thread',
    });

    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('data-transient-surface', 'file-drop');
    expect(status).toHaveAttribute('data-testid', 'chat-drop-zone-overlay');
    expect(status).toHaveClass('system-b-chat-drop-zone-overlay');
    expect(
      status.querySelector('.system-b-chat-drop-zone-border')
    ).not.toBeNull();
    expect(status.querySelector('.system-b-chat-drop-zone-badges')).toBeNull();
  });

  it('does not mount when no file drag is active', () => {
    fastRender(<ChatDropZoneOverlay isDragOver={false} pendingFiles={[]} />);

    expect(screen.queryByRole('status')).toBeNull();
  });
});
