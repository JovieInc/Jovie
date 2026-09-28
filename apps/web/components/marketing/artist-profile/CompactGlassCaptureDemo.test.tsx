import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { CompactGlassCaptureDemo } from './CompactGlassCaptureDemo';
import storyMeta, {
  Fallback,
  Interactive,
  LongContent,
  Resettable,
  Static,
} from './CompactGlassCaptureDemo.stories';

const capture = ARTIST_PROFILE_COPY.capture;

describe('CompactGlassCaptureDemo', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the shared compact-glass material with the real capture copy', () => {
    render(<CompactGlassCaptureDemo />);

    const moduleEl = document.querySelector('.compact-glass-module');
    expect(moduleEl).toBeInTheDocument();
    expect(screen.getByText(capture.action.ctaLabel)).toBeInTheDocument();
    expect(screen.getByText(capture.action.detail)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /play demo/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing is sent or stored/i)).toBeInTheDocument();
  });

  it('plays the opt-in sequence to an honest confirmed result', async () => {
    vi.useFakeTimers();
    render(<CompactGlassCaptureDemo />);

    act(() =>
      fireEvent.click(screen.getByRole('button', { name: /play demo/i }))
    );

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    act(() => {
      vi.advanceTimersByTime(420);
    });

    expect(screen.getByText(capture.action.confirmedLabel)).toBeInTheDocument();
    expect(screen.getByText(/nothing was sent or stored/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replay/i })).toBeInTheDocument();
  });

  it('resets to the idle state from the control', async () => {
    render(<CompactGlassCaptureDemo initialPhase='done' />);

    expect(screen.getByText(capture.action.confirmedLabel)).toBeInTheDocument();

    act(() => fireEvent.click(screen.getByRole('button', { name: /reset/i })));

    expect(
      screen.queryByText(capture.action.confirmedLabel)
    ).not.toBeInTheDocument();
    expect(screen.getByText(capture.action.detail)).toBeInTheDocument();
  });

  it('never issues a mutation, send, or payment request', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');

    render(<CompactGlassCaptureDemo autoPlay />);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    act(() => {
      vi.advanceTimersByTime(420);
    });
    act(() => fireEvent.click(screen.getByRole('button', { name: /replay/i })));
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    act(() => {
      vi.advanceTimersByTime(420);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(screen.getByText(/nothing was sent or stored/i)).toBeInTheDocument();
  });

  it('keeps the shared fixture data untouched by demo state', async () => {
    vi.useFakeTimers();
    const snapshot = JSON.parse(JSON.stringify(capture));

    render(<CompactGlassCaptureDemo autoPlay />);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    act(() => {
      vi.advanceTimersByTime(420);
    });
    act(() => fireEvent.click(screen.getByRole('button', { name: /reset/i })));

    expect(capture).toEqual(snapshot);
  });

  it('binds the storybook receipt to the required states', () => {
    expect(storyMeta.component).toBe(CompactGlassCaptureDemo);
    for (const story of [
      Static,
      Interactive,
      Resettable,
      LongContent,
      Fallback,
    ]) {
      expect(story).toBeDefined();
    }
    expect(Resettable.args?.initialPhase).toBe('done');
  });
});
