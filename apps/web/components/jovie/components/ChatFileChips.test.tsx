import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { PendingFile } from '../hooks/useChatFileAttachments';
import { ChatFileChips } from './ChatFileChips';

function pendingFile(overrides: Partial<PendingFile>): PendingFile {
  return {
    id: 'file-1',
    name: 'master.wav',
    size: 10_485_760,
    mediaType: 'audio/wav',
    kind: 'audio',
    progress: 100,
    speed: 0,
    status: 'ready',
    kindLabel: 'Audio',
    ...overrides,
  };
}

describe('ChatFileChips', () => {
  it('renders nothing until a file is ready', async () => {
    const { container } = render(
      <ChatFileChips
        files={[pendingFile({ status: 'uploading', progress: 40 })]}
        onRemove={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('removes the chip the user dismisses', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ChatFileChips
        files={[
          pendingFile({ id: 'audio', name: 'master.wav' }),
          pendingFile({ id: 'zip', name: 'stems.zip', kind: 'archive' }),
          pendingFile({ id: 'queued', name: 'queued.wav', status: 'queued' }),
        ]}
        onRemove={onRemove}
      />
    );

    expect(screen.queryByText('queued.wav')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove stems.zip' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('zip');
    await expectNoA11yViolations(container);
  });

  it('reserves the preview box with explicit image dimensions', async () => {
    const { container } = render(
      <ChatFileChips
        files={[
          pendingFile({
            id: 'art',
            name: 'cover-art.png',
            kind: 'image',
            previewUrl: 'blob:cover-art',
          }),
        ]}
        onRemove={vi.fn()}
      />
    );

    const preview = screen.getByRole('img', { name: 'cover-art.png' });
    expect(preview).toHaveAttribute('width', '24');
    expect(preview).toHaveAttribute('height', '24');
    await expectNoA11yViolations(container);
  });
});
