import { Skeleton } from '@jovie/ui';

const INBOX_LOADING_CARDS = [
  { key: 'inbox-loading-1', titleWidth: 'w-3/4', bodyWidth: 'w-1/2' },
  { key: 'inbox-loading-2', titleWidth: 'w-2/3', bodyWidth: 'w-2/5' },
  { key: 'inbox-loading-3', titleWidth: 'w-4/5', bodyWidth: 'w-1/3' },
] as const;

/** Card-shaped placeholders for the Needs You queue. */
export function OpportunityInboxLoadingCards() {
  return (
    <div
      role='status'
      aria-busy='true'
      className='system-b-opportunity-inbox-feed'
      data-testid='opportunity-inbox-loading'
    >
      <span className='sr-only'>Loading Your Inbox</span>
      {INBOX_LOADING_CARDS.map(card => (
        <div
          key={card.key}
          data-testid='opportunity-inbox-loading-card'
          className='flex flex-col gap-2 rounded-xl border border-subtle bg-surface-0 p-4'
        >
          <Skeleton className='h-3 w-20' rounded='full' />
          <Skeleton className={`h-4 ${card.titleWidth}`} />
          <Skeleton className={`h-3 ${card.bodyWidth}`} />
          <div className='mt-2 flex gap-2'>
            <Skeleton className='h-7 w-20' rounded='full' />
            <Skeleton className='h-7 w-16' rounded='full' />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * First-boot main slot for Home (`/app`). Mirrors the loaded page's centered
 * inbox column and Needs You / Done For You toolbar so the queue fills in
 * place instead of the page flashing blank (or a chat composer) while it
 * loads. The shell skeleton owns the canvas, so this draws no frame of its own.
 */
export function OpportunityInboxRouteSkeleton() {
  return (
    <section
      aria-label='Loading Inbox'
      aria-busy='true'
      className='flex min-h-0 w-full flex-1 flex-col overflow-hidden'
      data-testid='opportunity-inbox-route-skeleton'
    >
      <div className='system-b-opportunity-inbox-page'>
        <div
          className='mb-4 flex min-h-7 items-center justify-center gap-1'
          aria-hidden='true'
        >
          <Skeleton className='h-7 w-24' rounded='md' />
          <Skeleton className='h-7 w-28' rounded='md' />
        </div>
        <OpportunityInboxLoadingCards />
      </div>
    </section>
  );
}
