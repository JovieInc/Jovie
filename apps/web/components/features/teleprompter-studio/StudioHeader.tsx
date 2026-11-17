import { Badge, IconButton } from '@jovie/ui';
import { Mic, X } from 'lucide-react';
import { formatTakeDuration } from '@/lib/teleprompter/studio-recorder';

interface StudioHeaderProps {
  readonly title: string;
  readonly isRecording: boolean;
  /** The take being recorded, counted from 1. */
  readonly takeNumber: number;
  readonly elapsedMs: number;
  readonly savedCount: number;
  /** How the script moves; hidden while answering a question. */
  readonly follow: { readonly voice: boolean; readonly label: string } | null;
  readonly onClose: () => void;
}

export function StudioHeader({
  title,
  isRecording,
  takeNumber,
  elapsedMs,
  savedCount,
  follow,
  onClose,
}: StudioHeaderProps) {
  return (
    <header className='flex items-center justify-between gap-3'>
      <div className='flex items-center gap-2'>
        {isRecording ? (
          <Badge tone='error'>
            <span className='mr-1.5 inline-block size-1.5 rounded-full bg-error' />
            <span className='tabular-nums'>
              Take {takeNumber} · {formatTakeDuration(elapsedMs)}
            </span>
          </Badge>
        ) : savedCount > 0 ? (
          <Badge tone='success'>
            {savedCount} {savedCount === 1 ? 'Take' : 'Takes'} Saved
          </Badge>
        ) : (
          <Badge tone='neutral'>{title}</Badge>
        )}
      </div>
      <div className='flex items-center gap-2'>
        {follow ? (
          <Badge tone={follow.voice ? 'accent' : 'neutral'}>
            {follow.voice ? (
              <Mic className='mr-1 size-3' aria-hidden='true' />
            ) : null}
            {follow.label}
          </Badge>
        ) : null}
        <IconButton
          variant='frosted'
          size='md'
          ariaLabel='Close studio'
          onClick={onClose}
          disabled={isRecording}
          data-testid='teleprompter-studio-close'
        >
          <X className='size-4' aria-hidden='true' />
        </IconButton>
      </div>
    </header>
  );
}
