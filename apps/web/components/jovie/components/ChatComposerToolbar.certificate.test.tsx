import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ComposerAttachButton,
  ComposerMicButton,
  ComposerSendButton,
} from './ChatComposerToolbar';

const sendProps = {
  canSend: true,
  isStreaming: false,
  reducedMotion: true,
  onMouseDown: vi.fn(),
};

describe('ChatComposerToolbar certificate', () => {
  it('sends, and is disabled when the composer is empty', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { container, rerender } = render(
      <TooltipProvider>
        <ComposerSendButton {...sendProps} onSend={onSend} />
      </TooltipProvider>
    );

    await user.click(screen.getByRole('button'));
    expect(onSend).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);

    rerender(
      <TooltipProvider>
        <ComposerSendButton {...sendProps} canSend={false} onSend={onSend} />
      </TooltipProvider>
    );
    expect(screen.getByRole('button')).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('stops while streaming and interrupts when a message is queued', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    const onInterruptAndSend = vi.fn();
    const { container, rerender } = render(
      <TooltipProvider>
        <ComposerSendButton
          {...sendProps}
          isStreaming
          onStop={onStop}
        />
      </TooltipProvider>
    );

    await user.click(screen.getByRole('button'));
    expect(onStop).toHaveBeenCalledTimes(1);

    rerender(
      <TooltipProvider>
        <ComposerSendButton
          {...sendProps}
          canSend={false}
          canInterruptAndSend
          isStreaming
          onStop={onStop}
          onInterruptAndSend={onInterruptAndSend}
        />
      </TooltipProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Interrupt and send' }));
    expect(onInterruptAndSend).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('toggles the attach menu and disables while files process', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { container, rerender } = render(
      <TooltipProvider>
        <ComposerAttachButton
          isFileProcessing={false}
          plusMenuOpen={false}
          onOpenChange={onOpenChange}
          onMouseDown={vi.fn()}
        />
      </TooltipProvider>
    );

    await user.click(screen.getByRole('button'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    await expectNoA11yViolations(container);

    rerender(
      <TooltipProvider>
        <ComposerAttachButton
          isFileProcessing
          plusMenuOpen={false}
          onOpenChange={onOpenChange}
          onMouseDown={vi.fn()}
        />
      </TooltipProvider>
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('keeps the mic control axe-clean while idle and listening', async () => {
    const props = {
      isSupported: true,
      onPreserveFocus: vi.fn(),
      onPushStart: vi.fn(),
      onPushEnd: vi.fn(),
      onToggle: vi.fn(),
    };
    const { container, rerender } = render(
      <TooltipProvider>
        <ComposerMicButton {...props} isListening={false} />
      </TooltipProvider>
    );
    await expectNoA11yViolations(container);

    rerender(
      <TooltipProvider>
        <ComposerMicButton {...props} isListening />
      </TooltipProvider>
    );
    await expectNoA11yViolations(container);
  });
});
