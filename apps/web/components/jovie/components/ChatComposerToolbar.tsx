'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SimpleTooltip,
} from '@jovie/ui';
import {
  ArrowUp,
  FileAudio2,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Plus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useRef } from 'react';

import { cn } from '@/lib/utils';
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

function getButtonIcon(
  showStop: boolean,
  isLoading: boolean,
  isSubmitting: boolean
): { key: string; icon: React.ReactNode } {
  if (showStop) {
    return {
      key: 'stop',
      icon: <span className='block h-3 w-3 rounded-sm bg-current' />,
    };
  }
  if (isLoading || isSubmitting) {
    return {
      key: 'loading',
      icon: <Loader2 className='h-4 w-4 animate-spin' strokeWidth={2.25} />,
    };
  }
  return {
    key: 'send',
    icon: <ArrowUp className='h-4 w-4' strokeWidth={2.35} />,
  };
}

export interface ComposerSendButtonProps {
  readonly canSend: boolean;
  readonly isStreaming: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly reducedMotion: boolean | null;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onSend?: () => void;
  readonly onStop?: () => void;
}

export function ComposerSendButton({
  canSend,
  isStreaming,
  isLoading,
  isSubmitting,
  reducedMotion,
  onMouseDown,
  onSend,
  onStop,
}: ComposerSendButtonProps) {
  const showStop = isStreaming && Boolean(onStop);
  const { key, icon } = getButtonIcon(showStop, isLoading, isSubmitting);
  const motionInit = reducedMotion ? undefined : { scale: 0.5, opacity: 0 };
  const isInteractive = showStop || canSend;

  return (
    <SimpleTooltip content={showStop ? 'Stop generating' : 'Send message'}>
      <button
        type='button'
        onMouseDown={onMouseDown}
        onClick={showStop ? onStop : onSend}
        disabled={!showStop && !canSend}
        className={cn(
          'system-b-chat-composer-primary-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          !isInteractive && 'cursor-not-allowed'
        )}
        aria-label={showStop ? 'Stop generating' : 'Send message'}
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
    </SimpleTooltip>
  );
}

export interface ComposerAttachButtonProps {
  readonly isImageProcessing: boolean;
  readonly isAudioProcessing?: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  /**
   * Caller-driven disable (e.g. slash picker has the keyboard). Independent
   * of loading/submitting so the trigger can be inert without showing a
   * spinner.
   */
  readonly disabled?: boolean;
  readonly plusMenuOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onImageAttach: () => void;
  readonly onAudioAttach?: () => void;
}

export function ComposerAttachButton({
  isImageProcessing,
  isAudioProcessing = false,
  isLoading,
  isSubmitting,
  disabled = false,
  plusMenuOpen,
  onOpenChange,
  onMouseDown,
  onImageAttach,
  onAudioAttach,
}: ComposerAttachButtonProps) {
  const isProcessing = isImageProcessing || isAudioProcessing;

  return (
    <DropdownMenu open={plusMenuOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          onMouseDown={onMouseDown}
          disabled={isProcessing || isLoading || isSubmitting || disabled}
          className={cn(
            'system-b-chat-composer-icon-button flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          aria-label='Attachment options'
        >
          {isProcessing ? (
            <Loader2 className='h-4 w-4 animate-spin' strokeWidth={2.25} />
          ) : (
            <Plus className='h-4 w-4' strokeWidth={2.25} />
          )}
        </button>
      </DropdownMenuTrigger>
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
            onImageAttach();
          }}
        >
          <ImagePlus className='h-3.5 w-3.5' />
          Attach image
        </DropdownMenuItem>
        {onAudioAttach ? (
          <DropdownMenuItem
            className='min-h-9 gap-2 rounded-lg px-2.5 py-2'
            onSelect={() => {
              onAudioAttach();
            }}
          >
            <FileAudio2 className='h-3.5 w-3.5' />
            Attach audio
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ComposerMicButtonProps {
  readonly isListening: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
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
  isLoading,
  isSubmitting,
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
      if (isLoading || isSubmitting || !isSupported) return;
      suppressClickToggleRef.current = false;
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      onPushStart();
    },
    [isLoading, isSubmitting, isSupported, onPreserveFocus, onPushStart]
  );

  const handlePointerEnd = useCallback(() => {
    if (isLoading || isSubmitting || !isSupported) return;
    suppressClickToggleRef.current = true;
    onPushEnd();
  }, [isLoading, isSubmitting, isSupported, onPushEnd]);

  const handleClick = useCallback(() => {
    if (suppressClickToggleRef.current) {
      suppressClickToggleRef.current = false;
      return;
    }
    onToggle();
  }, [onToggle]);

  return (
    <SimpleTooltip content={tooltip}>
      <button
        type='button'
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={isListening ? handlePointerEnd : undefined}
        onClick={handleClick}
        disabled={isLoading || isSubmitting || !isSupported}
        data-testid='dictation-toggle'
        data-active={isListening ? 'true' : undefined}
        className={cn(
          'system-b-chat-composer-icon-button flex h-9 w-9 shrink-0 items-center justify-center rounded-full touch-none select-none',
          !isSupported
            ? 'text-quaternary-token'
            : !isListening && 'text-tertiary-token',
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
      </button>
    </SimpleTooltip>
  );
}
