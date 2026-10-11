import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriberCallbacks } from '@/lib/chat/transcriber';
import {
  fixturePacket,
  fixtureReceipt,
  fixtureRow,
} from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationRow } from '@/lib/ovie/certifications/types';
import { CertificationWalkthrough } from './CertificationWalkthrough';

const mocks = vi.hoisted(() => ({
  transcriber: {
    isSupported: true,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    dispose: vi.fn(),
  },
  callbacks: { current: null as TranscriberCallbacks | null },
}));

vi.mock('@/lib/chat/transcriber', () => ({
  createWebSpeechTranscriber: (callbacks: TranscriberCallbacks) => {
    mocks.callbacks.current = callbacks;
    return mocks.transcriber;
  },
}));

function renderWalkthrough(
  overrides: {
    row?: OvieCertificationRow | null;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onDecide?: (
      decision: 'approved' | 'changes_requested' | 'rejected',
      notes: string | null
    ) => Promise<boolean | void>;
    pendingDecision?: 'approved' | 'changes_requested' | 'rejected' | null;
  } = {}
) {
  const props = {
    row: fixtureRow('signup-golden-path'),
    open: true,
    onOpenChange: vi.fn(),
    onDecide: vi.fn(async () => undefined),
    pendingDecision: null,
    ...overrides,
  };
  rtlRender(<CertificationWalkthrough {...props} />);
  return props;
}

function dictate(text: string) {
  fireEvent.click(screen.getByTestId('walkthrough-dictate'));
  act(() => mocks.callbacks.current?.onTranscript(text));
}

describe('CertificationWalkthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbacks.current = null;
    mocks.transcriber.isSupported = true;
  });

  it('renders the bound artifact and evidence digest for the open row', () => {
    const row = fixtureRow('signup-golden-path');
    renderWalkthrough({ row });

    expect(screen.getByTestId('certification-walkthrough')).toBeInTheDocument();
    expect(screen.getByText(row.subject.title)).toBeInTheDocument();
    expect(screen.getByTestId('walkthrough-image')).toHaveAttribute(
      'src',
      'https://example.test/screenshot.png'
    );
    expect(
      screen.getByText(/dictate while the proof plays/i)
    ).toBeInTheDocument();
  });

  it('blocks certification until the image loads and after a load failure', () => {
    const { onDecide } = renderWalkthrough();
    const certify = screen.getByRole('button', { name: 'Certify' });
    expect(certify).toBeDisabled();
    fireEvent.click(certify);
    expect(onDecide).not.toHaveBeenCalled();
    fireEvent.load(screen.getByTestId('walkthrough-image'));
    expect(certify).toBeEnabled();
    fireEvent.error(screen.getByTestId('walkthrough-image'));
    expect(certify).toBeDisabled();
    expect(screen.getByText(/proof could not load/i)).toBeInTheDocument();
  });

  it('cannot certify without a review artifact', () => {
    const row = fixtureRow('empty-proof');
    renderWalkthrough({ row: { ...row, evidence: [] } });
    expect(screen.getByRole('button', { name: 'Certify' })).toBeDisabled();
  });

  it('opens loaded image proof at full size without submitting a decision', () => {
    const { onDecide } = renderWalkthrough();
    expect(
      screen.queryByRole('link', { name: 'Open Full-Size Proof' })
    ).toBeNull();
    fireEvent.load(screen.getByTestId('walkthrough-image'));
    const link = screen.getByRole('link', { name: 'Open Full-Size Proof' });
    expect(link).toHaveAttribute('href', 'https://example.test/screenshot.png');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(onDecide).not.toHaveBeenCalled();
    fireEvent.error(screen.getByTestId('walkthrough-image'));
    expect(
      screen.queryByRole('link', { name: 'Open Full-Size Proof' })
    ).toBeNull();
  });

  it('captures dictation as anchored segments and ends the review', () => {
    renderWalkthrough();

    dictate('Hero spacing is off on desktop');
    expect(mocks.transcriber.start).toHaveBeenCalled();
    expect(
      screen.getByText('Hero spacing is off on desktop')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'End Review' }));
    expect(mocks.transcriber.stop).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Request Changes (1)' })
    ).toBeEnabled();
  });

  it('submits structured findings as changes_requested notes', async () => {
    const { onDecide, onOpenChange } = renderWalkthrough();

    dictate('Maybe the headline wraps weirdly?');
    fireEvent.click(screen.getByRole('button', { name: 'End Review' }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Request Changes (1)' })
      );
    });

    expect(onDecide).toHaveBeenCalledWith(
      'changes_requested',
      expect.stringContaining('Maybe the headline wraps weirdly?')
    );
    expect(onDecide).toHaveBeenCalledWith(
      'changes_requested',
      expect.stringContaining('ambiguous')
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('certifies through the bound decision contract without notes when empty', async () => {
    const { onDecide } = renderWalkthrough();

    fireEvent.load(screen.getByTestId('walkthrough-image'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Certify' }));
    });

    expect(onDecide).toHaveBeenCalledWith('approved', null);
  });

  it('blocks decisions when the evidence digest moved during review', () => {
    const row = fixtureRow('signup-golden-path');
    const onDecide = vi.fn(async () => undefined);
    const { rerender } = rtlRender(
      <CertificationWalkthrough
        row={row}
        open={true}
        onOpenChange={vi.fn()}
        onDecide={onDecide}
        pendingDecision={null}
      />
    );

    dictate('Keep this comment across refreshes');

    rerender(
      <CertificationWalkthrough
        row={{
          ...row,
          decision: {
            ...row.decision,
            evidenceDigest: 'f'.repeat(64),
          },
        }}
        open={true}
        onOpenChange={vi.fn()}
        onDecide={onDecide}
        pendingDecision={null}
      />
    );

    expect(screen.getByTestId('walkthrough-stale')).toBeInTheDocument();
    expect(
      screen.getByText('Keep this comment across refreshes')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Certify' })).toBeDisabled();
  });

  it('keeps the walkthrough open when the decision is not recorded', async () => {
    const onOpenChange = vi.fn();
    const onDecide = vi.fn(async () => false);
    renderWalkthrough({ onOpenChange, onDecide });

    fireEvent.load(screen.getByTestId('walkthrough-image'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Certify' }));
    });

    expect(onDecide).toHaveBeenCalledWith('approved', null);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId('certification-walkthrough')).toBeInTheDocument();
  });

  it('loads proof again when switching to a different review with the same image URL', () => {
    const row = fixtureRow('first-review');
    const props = {
      row,
      open: true,
      onOpenChange: vi.fn(),
      onDecide: vi.fn(async () => true),
      pendingDecision: null,
    };
    const { rerender } = rtlRender(<CertificationWalkthrough {...props} />);
    const firstImage = screen.getByTestId('walkthrough-image');
    fireEvent.load(firstImage);
    expect(screen.getByRole('button', { name: 'Certify' })).toBeEnabled();
    rerender(
      <CertificationWalkthrough {...props} row={fixtureRow('second-review')} />
    );
    const nextImage = screen.getByTestId('walkthrough-image');
    expect(nextImage).not.toBe(firstImage);
    expect(nextImage).toHaveAttribute('src', firstImage.getAttribute('src'));
    expect(screen.getByRole('button', { name: 'Certify' })).toBeDisabled();
    fireEvent.load(nextImage);
    expect(screen.getByRole('button', { name: 'Certify' })).toBeEnabled();
  });

  it('waits for video data, then blocks a playback error', () => {
    renderWalkthrough({
      row: fixtureRow('video', {
        packet: fixturePacket('video', {
          visualProof: [
            fixtureReceipt('visual_proof', 'video', 'passed', '/proof.webm'),
          ],
        }),
      }),
    });
    const certify = screen.getByRole('button', { name: 'Certify' });
    expect(certify).toBeDisabled();
    const video = screen.getByTestId('walkthrough-video');
    fireEvent.loadedData(video);
    expect(certify).toBeEnabled();
    fireEvent.error(video);
    expect(certify).toBeDisabled();
  });

  it('keeps comments and exposes a save error for a rejected request', async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error('network failure'));
    const onOpenChange = vi.fn();
    renderWalkthrough({ onDecide, onOpenChange });
    dictate('Keep the existing layout');
    fireEvent.load(screen.getByTestId('walkthrough-image'));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Certify' }))
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Decision was not saved'
    );
    expect(screen.getByText('Keep the existing layout')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Certify' })).toBeEnabled();
  });

  it('deduplicates activations while persistence is in flight', async () => {
    let resolve!: (value: boolean) => void;
    const onDecide = vi.fn(
      () =>
        new Promise<boolean>(done => {
          resolve = done;
        })
    );
    const { onOpenChange } = renderWalkthrough({ onDecide });
    fireEvent.load(screen.getByTestId('walkthrough-image'));
    const certify = screen.getByRole('button', { name: 'Certify' });
    fireEvent.click(certify);
    fireEvent.click(certify);
    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(certify).toBeDisabled();
    await act(async () => resolve(true));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('surfaces an error when dictation is unsupported', () => {
    mocks.transcriber.isSupported = false;
    renderWalkthrough();

    fireEvent.click(screen.getByTestId('walkthrough-dictate'));
    expect(
      screen.getByText('Live dictation is not supported in this browser.')
    ).toBeInTheDocument();
    expect(mocks.transcriber.start).not.toHaveBeenCalled();
  });
});
