import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriberCallbacks } from '@/lib/chat/transcriber';
import { fixtureRow } from '@/lib/ovie/certifications/fixtures';
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

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Certify' }));
    });

    expect(onDecide).toHaveBeenCalledWith('approved', null);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId('certification-walkthrough')).toBeInTheDocument();
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
