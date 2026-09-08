import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ComposerMicButton,
  type ComposerMicButtonProps,
} from './ChatComposerToolbar';

function MicButton(overrides: Partial<ComposerMicButtonProps> = {}) {
  const props: ComposerMicButtonProps = {
    isListening: false,
    isSupported: true,
    unavailableHint: null,
    onPreserveFocus: vi.fn(),
    onPushStart: vi.fn(),
    onPushEnd: vi.fn(),
    onToggle: vi.fn(),
    onUnavailable: vi.fn(),
    ...overrides,
  };
  return render(
    <TooltipProvider>
      <ComposerMicButton {...props} />
    </TooltipProvider>
  );
}

describe('ComposerMicButton', () => {
  it('push-to-talk: pointer down starts, pointer up stops, and the click after a hold does not double-toggle', () => {
    const onPushStart = vi.fn();
    const onPushEnd = vi.fn();
    const onToggle = vi.fn();
    MicButton({ onPushStart, onPushEnd, onToggle });

    const mic = screen.getByTestId('dictation-toggle');
    fireEvent.pointerDown(mic);
    expect(onPushStart).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(mic);
    expect(onPushEnd).toHaveBeenCalledTimes(1);
    // The click the browser fires after pointer-up is suppressed so a hold
    // never becomes a toggle.
    fireEvent.click(mic);
    expect(onToggle).not.toHaveBeenCalled();

    // A plain click with no preceding hold toggles (fresh mount below).
    const onToggle2 = vi.fn();
    MicButton({ onToggle: onToggle2 });
    const mic2 = screen.getAllByTestId('dictation-toggle').pop()!;
    fireEvent.click(mic2);
    expect(onToggle2).toHaveBeenCalledTimes(1);
  });

  it('when unsupported without a hint the mic is disabled and shows browser-unavailable copy', () => {
    MicButton({ isSupported: false, unavailableHint: null });

    const mic = screen.getByTestId('dictation-toggle');
    expect(mic).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /dictation unavailable/i })
    ).toBeTruthy();
  });

  it('when unsupported WITH a hint (Electron system-dictation path) the mic stays enabled and press surfaces the hint via onUnavailable', () => {
    const onUnavailable = vi.fn();
    const onToggle = vi.fn();
    MicButton({
      isSupported: false,
      unavailableHint: 'Use macOS dictation (press Fn twice).',
      onUnavailable,
      onToggle,
    });

    const mic = screen.getByTestId('dictation-toggle');
    expect(mic).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /dictation unavailable/i })
    ).toBeTruthy();

    fireEvent.click(mic);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    // An unsupported mic never starts dictation.
    expect(onToggle).not.toHaveBeenCalled();
  });
});
