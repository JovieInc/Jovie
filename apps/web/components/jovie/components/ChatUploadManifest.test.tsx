import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { PendingFile } from '../hooks/useChatFileAttachments';
import { ChatUploadManifest } from './ChatUploadManifest';

const checkout = await vi.hoisted(async () => {
  const { createUpgradeCheckoutFixture } = await import(
    '@/tests/fixtures/upgrade-checkout'
  );
  return createUpgradeCheckoutFixture();
});
vi.mock('@/lib/analytics', () => ({
  track: checkout.track,
  useFeatureFlag: () => true,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: checkout.push }),
}));
vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => ({
    mutate: checkout.mutate,
    reset: checkout.reset,
    isPending: false,
    error: null,
  }),
  usePricingOptionsQuery: () => checkout.pricing,
}));
beforeEach(() => vi.clearAllMocks());

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

  it('names the canonical Artist Presence plan on the locked-files pay gate', () => {
    renderManifest({ lockedCount: 2, isPro: false });

    expect(screen.getByText('2 files locked')).toBeInTheDocument();
    expect(
      screen.getByText('Upgrade to Artist Presence for unlimited file uploads')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );
    expect(checkout.mutate).toHaveBeenCalledWith(
      { priceId: 'price_presence', source: 'in_app', returnTo: '/app' },
      expect.any(Object)
    );
    expect(checkout.push).not.toHaveBeenCalled();
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

  it('keeps status copy on the WCAG AA status-text tokens', () => {
    const failedFile: PendingFile = {
      ...uploadingFile,
      id: 'failed-file',
      status: 'failed',
      error: 'Upload failed',
    };
    renderManifest({
      files: [failedFile],
      isUploading: false,
      aggregate: {
        total: 1,
        done: 0,
        overallPct: 0,
        speed: '0 B/s',
        eta: '—',
      },
    });

    expect(screen.getByText('Upload failed')).toHaveClass('text-error-text');

    const manifestSource = readFileSync(
      resolve(__dirname, './ChatUploadManifest.tsx'),
      'utf8'
    );
    expect(manifestSource).toContain("return 'text-warning-text';");
    expect(manifestSource).toContain("return 'text-success-text';");
    expect(manifestSource).not.toContain("return 'text-error';");
    expect(manifestSource).not.toContain("return 'text-warning';");
  });

  it('collapses the expanded manifest from its header control', async () => {
    const onCollapse = vi.fn();
    const user = userEvent.setup();
    const { container } = renderManifest({ onCollapse });

    await user.click(
      screen.getByRole('button', { name: 'Collapse Upload Manifest' })
    );

    expect(onCollapse).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('expands the collapsed summary when it is pressed', async () => {
    const onExpand = vi.fn();
    const user = userEvent.setup();
    const { container } = renderManifest({ collapsed: true, onExpand });

    await user.click(
      screen.getByRole('button', { name: /Uploading 2 attachments/ })
    );

    expect(onExpand).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders nothing without files', async () => {
    const { container } = renderManifest({
      files: [],
      aggregate: { total: 0, done: 0, overallPct: 0, speed: '0 B/s', eta: '—' },
    });

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('keeps the locked-files and duplicate states accessible', async () => {
    const { container } = renderManifest({
      files: [readyFile, { ...uploadingFile, id: 'dup', status: 'duplicate' }],
      lockedCount: 1,
      isPro: false,
      isUploading: false,
    });

    expect(screen.getByText('1 duplicate skipped')).toBeInTheDocument();
    expect(screen.getByText('1 file locked')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reserves the thumbnail box with explicit image dimensions', () => {
    renderManifest({
      files: [{ ...readyFile, previewUrl: 'blob:cover-art' }],
    });

    const thumb = screen.getByRole('img', { name: 'cover-art.png' });
    expect(thumb).toHaveAttribute('width', '30');
    expect(thumb).toHaveAttribute('height', '30');
  });
  it('does not offer another subscription for paid users with locked files', () => {
    renderManifest({ lockedCount: 2, isPro: true });
    expect(
      screen.queryByRole('button', { name: 'Upgrade to Artist Presence' })
    ).not.toBeInTheDocument();
    expect(checkout.mutate).not.toHaveBeenCalled();
  });
});
