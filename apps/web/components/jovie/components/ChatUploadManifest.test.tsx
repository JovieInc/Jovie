import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PendingFile } from '../hooks/useChatFileAttachments';
import { ChatUploadManifest } from './ChatUploadManifest';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      layout: _layout,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      readonly initial?: unknown;
      readonly animate?: unknown;
      readonly exit?: unknown;
      readonly layout?: unknown;
      readonly transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

const uploadingFile: PendingFile = {
  id: 'uploading-file',
  name: 'festival-master.wav',
  size: 48_600_000,
  mediaType: 'audio/wav',
  kind: 'audio',
  progress: 73,
  speed: 1_200_000,
  status: 'uploading',
  kindLabel: 'Audio',
};

const readyFile: PendingFile = {
  id: 'ready-file',
  name: 'cover-art.png',
  size: 3_200_000,
  mediaType: 'image/png',
  kind: 'image',
  progress: 100,
  speed: 0,
  status: 'ready',
  kindLabel: 'Image',
};

function renderManifest(
  props: Partial<ComponentProps<typeof ChatUploadManifest>> = {}
) {
  const files = props.files ?? [uploadingFile, readyFile];

  return render(
    <ChatUploadManifest
      files={files}
      aggregate={
        props.aggregate ?? {
          total: files.length,
          done: files.filter(file => file.status === 'ready').length,
          overallPct: 50,
          speed: '1.2 MB/s',
          eta: '12s',
        }
      }
      isUploading={props.isUploading ?? true}
      onRemove={props.onRemove ?? vi.fn()}
      lockedCount={props.lockedCount}
      isPro={props.isPro}
      collapsed={props.collapsed}
      onExpand={props.onExpand}
      onCollapse={props.onCollapse}
    />
  );
}

describe('ChatUploadManifest', () => {
  it('renders canonical semantic progress for aggregate and per-file upload state', () => {
    renderManifest();

    expect(
      screen.getByRole('progressbar', {
        name: 'Upload progress: 1 of 2 files complete',
      })
    ).toHaveAttribute('aria-valuenow', '50');

    expect(
      screen.getByRole('progressbar', {
        name: 'Upload progress for festival-master.wav',
      })
    ).toHaveAttribute('aria-valuenow', '73');
  });

  it('clamps out-of-range upload percentages through the shared progress atom', () => {
    renderManifest({
      files: [{ ...uploadingFile, progress: 140 }],
      aggregate: {
        total: 1,
        done: 0,
        overallPct: -25,
        speed: '1.2 MB/s',
        eta: '12s',
      },
    });

    expect(
      screen.getByRole('progressbar', {
        name: 'Upload progress: 0 of 1 files complete',
      })
    ).toHaveAttribute('aria-valuenow', '0');

    expect(
      screen.getByRole('progressbar', {
        name: 'Upload progress for festival-master.wav',
      })
    ).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.queryByText('-25%')).not.toBeInTheDocument();
  });

  it('retires bespoke manifest bar fills in favor of ProgressBar ownership', () => {
    const manifestSource = readFileSync(
      resolve(__dirname, 'ChatUploadManifest.tsx'),
      'utf8'
    );
    const stylesSource = readFileSync(
      resolve(__dirname, '../../../styles/chat-file-upload.css'),
      'utf8'
    );

    expect(manifestSource).toContain('ProgressBar');
    expect(manifestSource).not.toContain(
      'system-b-chat-upload-manifest-bar-fill'
    );
    expect(manifestSource).not.toContain(
      'system-b-chat-upload-manifest-mini-bar-fill'
    );
    expect(stylesSource).not.toContain(
      'system-b-chat-upload-manifest-bar-fill'
    );
    expect(stylesSource).not.toContain(
      'system-b-chat-upload-manifest-mini-bar-fill'
    );
  });
});
