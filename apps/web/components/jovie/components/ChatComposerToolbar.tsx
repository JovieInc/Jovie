'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  isSubmitting: boolean,
  isCompact: boolean
): { key: string; icon: React.ReactNode } {
  const iconSize = isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  if (showStop) {
    return {
      key: 'stop',
      icon: (
        <span
          className={cn(
            'block rounded-[2px] bg-current',
            isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'
          )}
        />
      ),
    };
  }
  if (isLoading || isSubmitting) {
    return {
      key: 'loading',
      icon: <Loader2 className={cn('animate-spin', iconSize)} />,
    };
  }
  return { key: 'send', icon: <ArrowUp className={iconSize} /> };
}

export interface ComposerSendButtonProps {
  readonly canSend: boolean;
  readonly isStreaming: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly isCompact: boolean;
  readonly reducedMotion: boolean | null;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onStop?: () => void;
}

export function ComposerSendButton({
  canSend,
  isStreaming,
  isLoading,
  isSubmitting,
  isCompact,
  reducedMotion,
  onMouseDown,
  onStop,
}: ComposerSendButtonProps) {
  const showStop = isStreaming && Boolean(onStop);
  const { key, icon } = getButtonIcon(
    showStop,
    isLoading,
    isSubmitting,
    isCompact
  );
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
          'flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,box-shadow,transform] duration-fast',
          isInteractive
            ? 'bg-gradient-to-b from-white to-[#e8e8eb] text-black shadow-[inset_0_0.5px_0_rgba(255,255,255,0.6),inset_0_-0.5px_0_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.4)] hover:-translate-y-px hover:shadow-[inset_0_0.5px_0_rgba(255,255,255,0.7),inset_0_-0.5px_0_rgba(0,0,0,0.1),0_4px_12px_-2px_rgba(0,0,0,0.5)]'
            : 'cursor-not-allowed bg-white/[0.04] text-quaternary-token shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.04)]',
          isCompact ? 'h-8 w-8' : 'h-8 w-8'
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
  readonly isCompact: boolean;
  readonly isImageProcessing: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly plusMenuOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onImageAttach: () => void;
}

export function ComposerAttachButton({
  isCompact,
  isImageProcessing,
  isLoading,
  isSubmitting,
  plusMenuOpen,
  onOpenChange,
  onMouseDown,
  onImageAttach,
}: ComposerAttachButtonProps) {
  const iconSize = isCompact ? 'h-4 w-4' : 'h-[15px] w-[15px]';
  return (
    <DropdownMenu open={plusMenuOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          onMouseDown={onMouseDown}
          disabled={isImageProcessing || isLoading || isSubmitting}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full text-tertiary-token transition-[background-color,color] duration-fast',
            'hover:bg-white/[0.04] hover:text-primary-token',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'h-8 w-8'
          )}
          aria-label='Attachment options'
        >
          {isImageProcessing ? (
            <Loader2 className={cn('animate-spin', iconSize)} />
          ) : (
            <Plus className={iconSize} strokeWidth={1.6} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' side='top' sideOffset={8}>
        <DropdownMenuItem
          onSelect={() => {
            onImageAttach();
          }}
        >
          <ImagePlus className='mr-2 h-4 w-4' />
          Attach image
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ComposerMicButtonProps {
  readonly isCompact: boolean;
  readonly isListening: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onToggle: () => void;
}

export function ComposerMicButton({
  isCompact,
  isListening,
  isLoading,
  isSubmitting,
  onMouseDown,
  onToggle,
}: ComposerMicButtonProps) {
  const iconSize = isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <SimpleTooltip content={isListening ? 'Stop dictation' : 'Dictate message'}>
      <button
        type='button'
        onMouseDown={onMouseDown}
        onClick={onToggle}
        disabled={isLoading || isSubmitting}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full transition-[background-color,color] duration-fast',
          isListening
            ? 'bg-red-500/15 text-red-400 hover:bg-red-500/20'
            : 'text-tertiary-token hover:bg-white/[0.04] hover:text-primary-token',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'h-8 w-8'
        )}
        aria-label={isListening ? 'Stop dictation' : 'Dictate message'}
        aria-pressed={isListening}
      >
        {isListening ? (
          <MicOff className={iconSize} />
        ) : (
          <Mic className={iconSize} />
        )}
      </button>
    </SimpleTooltip>
  );
}
