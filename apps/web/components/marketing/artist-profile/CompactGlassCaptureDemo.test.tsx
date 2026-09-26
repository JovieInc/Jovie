import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { CompactGlassCaptureDemo } from './CompactGlassCaptureDemo';
import storyMeta, {
  Resettable,
  WithLabel,
} from './CompactGlassCaptureDemo.stories';
import { CompactGlassModule } from './CompactGlassModule';
import moduleStoryMeta, {
  WithLabel as ModuleWithLabel,
} from './CompactGlassModule.stories';

const capture = ARTIST_PROFILE_COPY.capture;

describe('CompactGlassCaptureDemo', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the shared compact-glass material with honest demo copy', () => {
    render(<CompactGlassCaptureDemo />);

    expect(document.querySelector('.compact-glass-module')).toBeInTheDocument();
    expect(screen.getByText(capture.action.ctaLabel)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /play demo/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing is sent or stored/i)).toBeInTheDocument();
  });

  it('plays to an honest confirmed result without fetch or XHR, then resets', () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
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
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(capture).toEqual(ARTIST_PROFILE_COPY.capture);

    act(() => fireEvent.click(screen.getByRole('button', { name: /reset/i })));
    expect(
      screen.queryByText(capture.action.confirmedLabel)
    ).not.toBeInTheDocument();
    expect(screen.getByText(capture.action.detail)).toBeInTheDocument();
  });

  it('binds the storybook receipt to the demo states', () => {
    expect(storyMeta.component).toBe(CompactGlassCaptureDemo);
    expect(Resettable.args?.initialPhase).toBe('done');
    expect(WithLabel.args?.label).toBe('Compact glass');
  });
});

describe('CompactGlassModule', () => {
  it('renders children, the optional label, and a merged className', () => {
    render(
      <CompactGlassModule label='Compact glass' className='extra'>
        <p>Module body</p>
      </CompactGlassModule>
    );

    expect(document.querySelector('.compact-glass-module')).toHaveClass(
      'extra'
    );
    expect(screen.getByText('Module body')).toBeInTheDocument();
    expect(screen.getByText('Compact glass')).toHaveClass(
      'compact-glass-module__label'
    );
    expect(moduleStoryMeta.component).toBe(CompactGlassModule);
    expect(ModuleWithLabel.args?.label).toBe('Compact glass');
  });

  it('omits the label when absent', () => {
    render(<CompactGlassModule>body</CompactGlassModule>);

    expect(
      document.querySelector('.compact-glass-module__label')
    ).not.toBeInTheDocument();
  });
});
