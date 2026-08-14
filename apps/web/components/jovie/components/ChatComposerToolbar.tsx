'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SimpleTooltip,
} from '@jovie/ui';
import { ArrowUp, Loader2, Mic, MicOff, Paperclip, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useRef } from 'react';

import { cn } from '@/lib/utils';
import {
  CHAT_COMPOSER_ATTACH_ARIA_LABEL,
  CHAT_COMPOSER_SEND_ARIA_LABEL,
  CHAT_COMPOSER_STOP_ARIA_LABEL,
} from '../chat-composer-copy';
import { TRANSITION_FAST } from './chat-motion';

/**
 * Toolbar primitives for the morphing chat composer.
 *
 * Three pieces, exposed independently so the surface can place them itself:
 *   - <ComposerAttachButton>: leading + button → image upload dropdown.
 *   - <ComposerMicButton>: trailing push-to-talk mic control.
 *   - <ComposerSendButton>: trailing primary send / stop.
 *
 * Pulled out of ChatInput to keep that file focused on layout + state.
 */

function getButtonIcon(showStop: boolean): {
  key: string;
  icon: React.ReactNode;
} {
  if (showStop) {
    return {
      key: 'stop',
      icon: <span className='block h-3 w-3 rounded-sm bg-current' />,
    };
  }
  return {
    key: 'send',
    icon: <ArrowUp className='h-4 w-4' strokeWidth={2.35} />,
  };
}

export interface ComposerSendButtonProps {
  readonly canSend: boolean;
  readonly canInterruptAndSend?: boolean;
  readonly isStreaming: boolean;
  readonly reducedMotion: boolean | null;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onSend?: () => void;
  readonly onInterruptAndSend?: () => void;
  readonly onStop?: () => void;
}

export function ComposerSendButton({
  canSend,
  canInterruptAndSend = false,
  isStreaming,
  reducedMotion,
  onMouseDown,
  onSend,
  onInterruptAndSend,
  onStop,
}: ComposerSendButtonProps) {
  const showStop = isStreaming && Boolean(onStop) && !canInterruptAndSend;
  const { key, icon } = getButtonIcon(showStop);
  const motionInit = reducedMotion ? undefined : { scale: 0.5, opacity: 0 };
  const isInteractive = showStop || canSend || canInterruptAndSend;

  const actionLabel = canInterruptAndSend
    ? 'Interrupt and send'
    : showStop
      ? CHAT_COMPOSER_STOP_ARIA_LABEL
      : CHAT_COMPOSER_SEND_ARIA_LABEL;
  // When empty, keep the same accessible name (tests + AT) but clarify the
  // disabled reason in the hover tooltip — disabled buttons need a span wrapper
  // so the tooltip trigger can still receive pointer events.
  const tooltipContent =
    showStop || canSend ? actionLabel : 'Type a message to send';

  return (
    <SimpleTooltip content={tooltipContent}>
      <span
        className={cn(
          'inline-flex shrink-0',
          !isInteractive && 'cursor-not-allowed'
        )}
      >
        <button
          type='button'
          onMouseDown={onMouseDown}
          onClick={
            showStop
              ? onStop
              : canInterruptAndSend
                ? onInterruptAndSend
                : onSend
          }
          disabled={!showStop && !canSend && !canInterruptAndSend}
          className={cn(
            'system-b-chat-composer-primary-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            !isInteractive && 'cursor-not-allowed'
          )}
          aria-label={actionLabel}
        >
          <AnimatePresence mode='wait' initial={false}>
            <motion.span
              key={key}
              initial={motionInit}
              animate={{ scale: 1, opacity: 1 }}
              exit={motionInit}
              transition={TRANSITION_FAST}
              className='flex items-center justify-center'
            >
              {icon}
            </motion.span>
          </AnimatePresence>
        </button>
      </span>
    </SimpleTooltip>
  );
}

export interface ComposerAttachButtonProps {
  readonly isFileProcessing: boolean;
  /**
   * Caller-driven disable (e.g. slash picker has the keyboard). Independent
   * of generation so attach stays live while the assistant works.
   */
  readonly disabled?: boolean;
  readonly plusMenuOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onFileAttach: () => void;
}

export function ComposerAttachButton({
  isFileProcessing,
  disabled = false,
  plusMenuOpen,
  onOpenChange,
  onMouseDown,
  onFileAttach,
}: ComposerAttachButtonProps) {
  const isProcessing = isFileProcessing;

  return (
    <DropdownMenu open={plusMenuOpen} onOpenChange={onOpenChange}>
      <SimpleTooltip content='Attach files'>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onMouseDown={onMouseDown}
            disabled={isProcessing || disabled}
            className={cn(
              'h-9 w-9 shrink-0 border border-transparent bg-surface-0 text-tertiary-token hover:border-subtle hover:bg-surface-1 hover:text-primary-token',
              plusMenuOpen && 'border-subtle bg-surface-1 text-primary-token',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
            aria-label={CHAT_COMPOSER_ATTACH_ARIA_LABEL}
          >
            {isProcessing ? (
              <Loader2 className='h-4 w-4 animate-spin' strokeWidth={2.25} />
            ) : (
              <Plus className='h-4 w-4' strokeWidth={2.25} />
            )}
          </Button>
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent
        align='start'
        side='top'
        sideOffset={8}
        alignOffset={-4}
        collisionPadding={16}
        className='system-b-chat-composer-menu w-48 p-1.5'
      >
        <DropdownMenuItem
          className='min-h-9 gap-2 rounded-lg px-2.5 py-2'
          onSelect={() => {
            onFileAttach();
          }}
        >
          <Paperclip className='h-3.5 w-3.5' />
          Attach files
          <span className='ml-auto text-2xs text-tertiary-token'>
            Drop or browse
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ComposerMicButtonProps {
  readonly isListening: boolean;
  readonly isSupported: boolean;
  readonly onPreserveFocus: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void;
  readonly onPushStart: () => void;
  readonly onPushEnd: () => void;
  readonly onToggle: () => void;
}

export function ComposerMicButton({
  isListening,
  isSupported,
  onPreserveFocus,
  onPushStart,
  onPushEnd,
  onToggle,
}: ComposerMicButtonProps) {
  const suppressClickToggleRef = useRef(false);

  const label = isSupported
    ? isListening
      ? 'Release to stop dictation'
      : 'Hold to dictate'
    : 'Dictation unavailable';

  const tooltip = isSupported
    ? isListening
      ? 'Release to stop dictation'
      : 'Hold to dictate · press to toggle'
    : 'Dictation unavailable in this browser';

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onPreserveFocus(event);
      if (!isSupported) return;
      suppressClickToggleRef.current = false;
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      onPushStart();
    },
    [isSupported, onPreserveFocus, onPushStart]
  );

  const handlePointerEnd = useCallback(() => {
    if (!isSupported) return;
    suppressClickToggleRef.current = true;
    onPushEnd();
  }, [isSupported, onPushEnd]);

  const handleClick = useCallback(() => {
    if (suppressClickToggleRef.current) {
      suppressClickToggleRef.current = false;
      return;
    }
    onToggle();
  }, [onToggle]);

  return (
    <SimpleTooltip content={tooltip}>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={isListening ? handlePointerEnd : undefined}
        onClick={handleClick}
        disabled={!isSupported}
        data-testid='dictation-toggle'
        data-active={isListening ? 'true' : undefined}
        className={cn(
          'h-9 w-9 shrink-0 touch-none select-none border border-transparent bg-surface-0 hover:border-subtle hover:bg-surface-1 hover:text-primary-token',
          !isSupported
            ? 'text-quaternary-token'
            : !isListening && 'text-tertiary-token',
          isListening && 'border-default bg-surface-2 text-primary-token',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        aria-label={label}
        aria-pressed={isListening}
      >
        {isListening ? (
          <MicOff className='h-4 w-4' strokeWidth={2.25} />
        ) : (
          <Mic className='h-4 w-4' strokeWidth={2.25} />
        )}
      </Button>
    </SimpleTooltip>
  );
}
