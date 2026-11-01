import {
  type SummerProgressPart,
  summerProgressLines,
} from '@/lib/chat/summer-progress';

/**
 * Calm progress line shown only while Summer streams, before the answer text
 * arrives. Lines mirror endpoint events exactly; with none, nothing renders.
 * The running dot only pulses when the user allows motion.
 */
export function ChatSummerProgress({
  progress,
}: Readonly<{ progress: readonly SummerProgressPart[] }>) {
  const lines = summerProgressLines(progress);
  if (lines.length === 0) return null;
  return (
    <div
      role='status'
      aria-live='polite'
      data-testid='chat-summer-progress'
      className='flex flex-col gap-0.5 pb-3 text-xs text-tertiary-token'
    >
      {lines.map(line => (
        <div
          key={`${line.key}:${line.state}`}
          data-state={line.state}
          className='flex items-center gap-1.5'
        >
          <span
            aria-hidden='true'
            className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${
              line.state === 'running'
                ? 'motion-safe:animate-pulse'
                : 'opacity-50'
            }`}
          />
          <span>{line.text}</span>
        </div>
      ))}
    </div>
  );
}
