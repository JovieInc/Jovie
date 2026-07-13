'use client';

import { Archive, Check, Loader2, Play, Rocket, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
  type ConfirmChatMerchActionType,
  useConfirmChatMerchActionMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { CHAT_TOOL_CANCELLED_LABEL, ChatToolSurface } from './ChatToolSurface';

interface ChatMerchActionCardProps {
  readonly profileId: string;
  readonly merchCardId: string;
  readonly action: ConfirmChatMerchActionType;
  readonly title: string;
  readonly currentStatus: string;
  readonly retailPrice: string;
  /**
   * When nested under ChatGenerationArtifactSurface (or another card),
   * drop the outer card chrome to avoid card-in-card (JOV-3551).
   */
  readonly nested?: boolean;
}

type CardState = 'pending' | 'confirming' | 'confirmed' | 'dismissed';

const ACTION_CONFIG: Record<
  ConfirmChatMerchActionType,
  {
    readonly label: string;
    readonly confirmLabel: string;
    readonly successLabel: string;
    readonly Icon: typeof Rocket;
    readonly destructive?: boolean;
  }
> = {
  publish: {
    label: 'Publish Merch',
    confirmLabel: 'Publish',
    successLabel: 'Merch is live',
    Icon: Rocket,
  },
  unpause: {
    label: 'Make Merch Live',
    confirmLabel: 'Make Live',
    successLabel: 'Merch is live',
    // Play (not Pause) — "Make Live" is a resume action (JOV-3551)
    Icon: Play,
  },
  archive: {
    label: 'Archive Merch',
    confirmLabel: 'Archive',
    successLabel: 'Merch archived',
    Icon: Archive,
    destructive: true,
  },
};

export function ChatMerchActionCard({
  profileId,
  merchCardId,
  action,
  title,
  currentStatus,
  retailPrice,
  nested = false,
}: ChatMerchActionCardProps) {
  const [state, setState] = useState<CardState>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmAction = useConfirmChatMerchActionMutation();
  const config = ACTION_CONFIG[action];
  const ActionIcon = config.Icon;
  const surfaceTone = nested ? 'flat' : 'default';

  const handleConfirm = useCallback(() => {
    setErrorMessage(null);
    setState('confirming');
    confirmAction.mutate(
      { profileId, merchCardId, action },
      {
        onSuccess: () => setState('confirmed'),
        onError: () => {
          setState('pending');
          setErrorMessage('Unable to apply merch action. Please try again.');
        },
      }
    );
  }, [profileId, merchCardId, action, confirmAction]);

  const handleDismiss = useCallback(() => {
    setState('dismissed');
  }, []);

  if (state === 'confirmed') {
    return (
      <ChatToolSurface tone={nested ? 'flat' : 'success'}>
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' />
          <span className='text-sm font-medium'>{config.successLabel}</span>
        </div>
      </ChatToolSurface>
    );
  }

  if (state === 'dismissed') {
    return (
      <ChatToolSurface tone={nested ? 'flat' : 'cancelled'}>
        <div className='flex items-center gap-2 text-secondary-token'>
          <X className='h-4 w-4' />
          <span className='text-sm'>{CHAT_TOOL_CANCELLED_LABEL}</span>
        </div>
      </ChatToolSurface>
    );
  }

  return (
    <ChatToolSurface
      tone={surfaceTone}
      className={nested ? undefined : 'system-b-chat-link-card'}
    >
      <div className='flex items-center gap-3'>
        <span
          className={cn(
            'system-b-chat-link-card-icon',
            config.destructive && 'system-b-chat-link-card-icon-remove'
          )}
        >
          <ActionIcon className='h-5 w-5 shrink-0' aria-hidden />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium text-primary-token'>
            {config.label}: {title}
          </p>
          <p className='text-xs text-tertiary-token'>
            {currentStatus} · {retailPrice}
          </p>
          {errorMessage ? (
            <output className='mt-1 block text-xs text-error'>
              {errorMessage}
            </output>
          ) : null}
        </div>
        <div className='shrink-0 flex items-center gap-1.5'>
          <button
            type='button'
            onClick={handleConfirm}
            disabled={state === 'confirming'}
            className={cn(
              'system-b-chat-link-primary-action',
              config.destructive
                ? 'bg-error text-error-foreground hover:bg-error/90'
                : 'border border-(--linear-btn-primary-border) bg-btn-primary text-btn-primary-foreground shadow-button-inset hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover',
              'disabled:opacity-50 transition-colors'
            )}
          >
            {state === 'confirming' ? (
              <Loader2 className='h-3 w-3 animate-spin' />
            ) : (
              <ActionIcon className='h-3 w-3' />
            )}
            {config.confirmLabel}
          </button>
          <button
            type='button'
            onClick={handleDismiss}
            disabled={state === 'confirming'}
            className={cn(
              'system-b-chat-link-dismiss-action',
              'text-secondary-token hover:bg-surface-0 hover:text-primary-token',
              'disabled:opacity-50 transition-colors'
            )}
            aria-label='Cancel Action'
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>
    </ChatToolSurface>
  );
}
