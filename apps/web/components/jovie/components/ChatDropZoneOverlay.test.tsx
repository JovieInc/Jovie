import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { fastRender } from '@/tests/utils/fast-render';
import type { FileKind, PendingFile } from '../hooks/useChatFileAttachments';
import { ChatDropZoneOverlay } from './ChatDropZoneOverlay';

function pendingFile(
  id: string,
  kind: FileKind,
  size: number,
  name = `${id}.bin`
): PendingFile {
  return {
    id,
    name,
    size,
    mediaType: 'application/octet-stream',
    kind,
    progress: 0,
    speed: 0,
    status: 'queued',
    kindLabel: kind,
  };
}

describe('ChatDropZoneOverlay', () => {
  it('announces the temporary drop target without replacing chat semantics', async () => {
    const { container } = fastRender(
      <ChatDropZoneOverlay isDragOver pendingFiles={[]} />
    );

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
    expect(status).toHaveTextContent(
      'Multiple files supported · ZIP auto-expanded'
    );
    await expectNoA11yViolations(container);
  });

  it('summarises detected files by count, size and kind', async () => {
    const { container } = fastRender(
      <ChatDropZoneOverlay
        isDragOver
        pendingFiles={[
          pendingFile('mix', 'audio', 48_600_000),
          pendingFile('cover', 'image', 3_200_000),
          pendingFile('stems', 'audio', 512),
        ]}
      />
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(
      '3 files · 49.4 MB detected · 2 audio, 1 images'
    );
    const badges = status.querySelectorAll('.system-b-chat-drop-zone-badge');
    expect([...badges].map(badge => badge.textContent)).toEqual([
      '2 audio',
      '1 images',
    ]);
    await expectNoA11yViolations(container);
  });

  it.each([
    [512, '512 B'],
    [20_480, '20 KB'],
    [2_621_440, '2.5 MB'],
    [3_221_225_472, '3.00 GB'],
  ])('formats %i bytes as %s', (size, label) => {
    fastRender(
      <ChatDropZoneOverlay
        isDragOver
        pendingFiles={[pendingFile('one', 'document', size)]}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `1 files · ${label} detected · 1 documents`
    );
  });

  it('keeps a long batch of every kind in one summary and one badge per kind', async () => {
    const kinds: FileKind[] = [
      'audio',
      'video',
      'image',
      'archive',
      'document',
    ];
    const files = Array.from({ length: 20 }, (_, index) =>
      pendingFile(
        `file-${index}`,
        kinds[index % kinds.length],
        1_000_000,
        `a-very-long-session-take-name-that-keeps-going-${index}.wav`
      )
    );
    const { container } = fastRender(
      <ChatDropZoneOverlay isDragOver pendingFiles={files} />
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('20 files');
    expect(
      status.querySelectorAll('.system-b-chat-drop-zone-badge')
    ).toHaveLength(5);
    await expectNoA11yViolations(container);
  });

  it('labels the other kind as files', () => {
    fastRender(
      <ChatDropZoneOverlay
        isDragOver
        pendingFiles={[pendingFile('x', 'other', 10)]}
      />
    );
    expect(screen.getByText('1 files')).toBeInTheDocument();
  });

  it('stays announced and axe-clean in a right-to-left thread', async () => {
    const { container } = fastRender(
      <div dir='rtl'>
        <ChatDropZoneOverlay
          isDragOver
          pendingFiles={[pendingFile('mix', 'audio', 2_000)]}
        />
      </div>
    );
    expect(
      screen.getByRole('status', {
        name: 'Drop Files To Attach To This Thread',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('does not mount when no file drag is active', () => {
    fastRender(<ChatDropZoneOverlay isDragOver={false} pendingFiles={[]} />);

    expect(screen.queryByRole('status')).toBeNull();
  });
});
