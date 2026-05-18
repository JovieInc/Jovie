'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SimpleTooltip,
} from '@jovie/ui';
import { ArrowUp, ImagePlus, Loader2, Mic, MicOff, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '@/lib/utils';
import { TRANSITION_FAST } from './chat-motion';

/**
 * Toolbar primitives for the morphing chat composer.
 *
 * Three pieces, exposed independently so the surface can place them itself:
 *   - <ComposerAttachButton>: leading + button → image upload dropdown.
 *   - <ComposerMicButton>: trailing mic toggle.
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
      icon: <span className='block h-3 w-3 rounded-[2px] bg-current' />,
    };
  }
  if (isLoading || isSubmitting) {
    return {
      key: 'loading',
      icon: <Loader2 className='h-4 w-4 animate-spin' />,
    };
  }
  return { key: 'send', icon: <ArrowUp className='h-4 w-4' /> };
}

export interface ComposerSendButtonProps {
  readonly canSend: boolean;
  readonly isStreaming: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly reducedMotion: boolean | null;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onStop?: () => void;
}

export function ComposerSendButton({
  canSend,
  isStreaming,
  isLoading,
  isSubmitting,
  reducedMotion,
  onMouseDown,
  onStop,
}: ComposerSendButtonProps) {
  const showStop = isStreaming && Boolean(onStop);
  const { key, icon } = getButtonIcon(showStop, isLoading, isSubmitting);
  const motionInit = reducedMotion ? undefined : { scale: 0.5, opacity: 0 };
  const isInteractive = showStop || canSend;

  return (
    <SimpleTooltip content={showStop ? 'Stop generating' : 'Send message'}>
      <button
        type={showStop ? 'button' : 'submit'}
        onMouseDown={onMouseDown}
        onClick={showStop ? onStop : undefined}
        disabled={!showStop && !canSend}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-fast',
          isInteractive
            ? 'bg-gradient-to-b from-white to-[#e8e8eb] text-black shadow-[inset_0_0.5px_0_rgba(255,255,255,0.68),inset_0_-0.5px_0_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.42)] hover:shadow-[inset_0_0.5px_0_rgba(255,255,255,0.78),inset_0_-0.5px_0_rgba(0,0,0,0.12),0_4px_14px_-4px_rgba(0,0,0,0.62)]'
            : 'cursor-not-allowed bg-white/[0.045] text-quaternary-token shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.045)]'
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
}

export function ComposerAttachButton({
  isImageProcessing,
  isLoading,
  isSubmitting,
  disabled = false,
  plusMenuOpen,
  onOpenChange,
  onMouseDown,
  onImageAttach,
}: ComposerAttachButtonProps) {
  return (
    <DropdownMenu open={plusMenuOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          onMouseDown={onMouseDown}
          disabled={isImageProcessing || isLoading || isSubmitting || disabled}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-tertiary-token transition-[background-color,color,box-shadow] duration-fast',
            'hover:bg-white/[0.055] hover:text-primary-token hover:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.055)]',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          aria-label='Attachment options'
        >
          {isImageProcessing ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <Plus className='h-4 w-4' strokeWidth={1.6} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        side='top'
        sideOffset={8}
        alignOffset={-4}
        collisionPadding={16}
        className='w-52 rounded-xl p-1'
      >
        <DropdownMenuLabel className='px-2.5 py-1.5 text-[11px] font-medium leading-4 text-tertiary-token'>
          Attachments
        </DropdownMenuLabel>
        <DropdownMenuItem
          className='min-h-9 gap-2 px-2.5 py-2'
          onSelect={() => {
            onImageAttach();
          }}
        >
          <ImagePlus className='h-4 w-4' />
          Attach image
        </DropdownMenuItem>
        <DropdownMenuSeparator className='my-1' />
        <div className='px-2.5 pb-1.5 pt-0.5 text-[11px] leading-4 text-tertiary-token'>
          Drop images anywhere in chat.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ComposerMicButtonProps {
  readonly isListening: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly isSupported: boolean;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onToggle: () => void;
}

export function ComposerMicButton({
  isListening,
  isLoading,
  isSubmitting,
  isSupported,
  onMouseDown,
  onToggle,
}: ComposerMicButtonProps) {
  const label = isSupported
    ? isListening
      ? 'Stop dictation'
      : 'Dictate message'
    : 'Dictation unavailable';

  return (
    <SimpleTooltip content={label}>
      <button
        type='button'
        onMouseDown={onMouseDown}
        onClick={onToggle}
        disabled={isLoading || isSubmitting || !isSupported}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-fast',
          !isSupported
            ? 'text-quaternary-token'
            : isListening
              ? 'bg-red-500/15 text-red-400 hover:bg-red-500/20'
              : 'text-tertiary-token hover:bg-white/[0.055] hover:text-primary-token hover:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.055)]',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        aria-label={label}
        aria-pressed={isListening}
      >
        {isListening ? (
          <MicOff className='h-4 w-4' />
        ) : (
          <Mic className='h-4 w-4' />
        )}
      </button>
    </SimpleTooltip>
  );
}
