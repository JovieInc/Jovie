import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface NotFoundCopyButtonProps {
  testId: string;
  releaseTitle: string;
  smartLinkPath: string;
  isCopied: boolean;
  onCopy: (path: string, label: string, testId: string) => Promise<void>;
}

/**
 * Fallback copy button for missing provider links
 */
export function NotFoundCopyButton({
  testId,
  releaseTitle,
  smartLinkPath,
  isCopied,
  onCopy,
}: Readonly<NotFoundCopyButtonProps>) {
  return (
    <button
      type='button'
      className={cn(
        'group/btn inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
        isCopied
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'text-tertiary-token hover:bg-surface-2 hover:text-primary-token'
      )}
      onClick={() =>
        void onCopy(smartLinkPath, `${releaseTitle} smart link`, testId)
      }
    >
      <Icon
        name={isCopied ? 'Check' : 'Copy'}
        className={cn(
          'h-3.5 w-3.5 transition-opacity',
          isCopied ? 'opacity-100' : 'opacity-0 group-hover/btn:opacity-100'
        )}
        aria-hidden='true'
      />
      <span className='line-clamp-1 text-tertiary-token/50'>
        {isCopied ? 'Copied!' : '—'}
      </span>
    </button>
  );
}
