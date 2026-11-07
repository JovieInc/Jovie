import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ComposerAttachButton,
  ComposerMicButton,
  type ComposerMicButtonProps,
  ComposerSendButton,
} from './ChatComposerToolbar';

function MicButton(overrides: Partial<ComposerMicButtonProps> = {}) {
  const props: ComposerMicButtonProps = {
    isListening: false,
    onPreserveFocus: vi.fn(),
    onPushStart: vi.fn(),
    onPushEnd: vi.fn(),
    onToggle: vi.fn(),
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

  it('is always pressable: a mic that cannot work is not rendered at all', () => {
    const buttonRef = createRef<HTMLButtonElement>();
    const view = MicButton({ buttonRef });
    const mic = screen.getByTestId('dictation-toggle');
    expect(mic).toBeEnabled();
    expect(buttonRef.current).toBe(mic);
    expect(
      screen.getByRole('button', { name: 'Hold to dictate' })
    ).toBeTruthy();
    view.unmount();
    expect(buttonRef.current).toBeNull();
  });
});

describe('ComposerAttachButton', () => {
  it('opens the shared composer palette instead of a file-only dropdown', () => {
    const onOpenChange = vi.fn();
    render(
      <TooltipProvider>
        <ComposerAttachButton
          isFileProcessing={false}
          plusMenuOpen={false}
          onOpenChange={onOpenChange}
          onMouseDown={vi.fn()}
        />
      </TooltipProvider>
    );

    const trigger = screen.getByRole('button', { name: 'Attachment options' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('option', { name: /Attach Files/i })
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('stays disabled while a file is processing', () => {
    render(
      <TooltipProvider>
        <ComposerAttachButton
          isFileProcessing
          plusMenuOpen={false}
          onOpenChange={vi.fn()}
          onMouseDown={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(
      screen.getByRole('button', { name: 'Attachment options' })
    ).toBeDisabled();
  });
});

describe('ComposerSendButton', () => {
  it.each([
    ['disabled', false, false, undefined],
    ['enabled', true, false, undefined],
    ['streaming stop', false, true, vi.fn()],
  ] as const)(
    'keeps the 36px %s face inside the canonical 44px hit target (JOV-4411)',
    (_state, canSend, isStreaming, onStop) => {
      render(
        <TooltipProvider>
          <ComposerSendButton
            canSend={canSend}
            isStreaming={isStreaming}
            reducedMotion
            onMouseDown={vi.fn()}
            onSend={vi.fn()}
            onStop={onStop}
          />
        </TooltipProvider>
      );

      const send = screen.getByRole('button');
      expect(send).toHaveClass(
        'system-b-chat-composer-primary-action',
        'relative',
        'h-9',
        'w-9'
      );
      expect(send.className).toContain('before:h-11');
      expect(send.className).toContain('before:w-11');
      expect(send.className).not.toMatch(/(?:^|\s)h-11(?:\s|$)/);
    }
  );

  it('keeps the tooltip wrapper out of the tab order so focus lands on a named control', () => {
    const { container } = render(
      <TooltipProvider>
        <ComposerSendButton
          canSend={false}
          isStreaming={false}
          reducedMotion
          onMouseDown={vi.fn()}
          onSend={vi.fn()}
        />
      </TooltipProvider>
    );

    const focusable = container.querySelectorAll('[tabindex="0"]');
    expect(focusable).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
});
