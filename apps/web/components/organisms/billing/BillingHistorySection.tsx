'use client';

import { Badge, Card, CardContent, LoadingSkeleton } from '@jovie/ui';
import { Clock } from 'lucide-react';
import { motion } from 'motion/react';
import type {
  BillingHistoryEntry,
  useBillingHistoryQuery,
} from '@/lib/queries';
import {
  EVENT_BADGE_CONFIG,
  formatDate,
  formatEventType,
  LINEAR_EASE,
} from './billing-constants';

export function BillingHistorySection({
  historyQuery,
}: {
  readonly historyQuery: ReturnType<typeof useBillingHistoryQuery>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: LINEAR_EASE }}
      className='space-y-4'
    >
      <h2 className='text-lg font-semibold text-primary-token'>
        Billing History
      </h2>

      {historyQuery.isLoading && (
        <Card>
          <CardContent className='p-6'>
            <LoadingSkeleton lines={4} height='h-12' rounded='md' />
          </CardContent>
        </Card>
      )}

      {!historyQuery.isLoading && historyQuery.error && (
        <Card>
          <CardContent className='p-6'>
            <p className='text-sm text-tertiary-token'>
              Unable to load billing history.
            </p>
          </CardContent>
        </Card>
      )}

      {!historyQuery.isLoading &&
        !historyQuery.error &&
        (historyQuery.data?.entries && historyQuery.data.entries.length > 0 ? (
          <Card>
            <CardContent className='p-0'>
              <div className='divide-y divide-[var(--color-border-subtle)]'>
                {historyQuery.data.entries.map((entry: BillingHistoryEntry) => {
                  const config = EVENT_BADGE_CONFIG[entry.eventType];
                  const IconComponent = config?.icon ?? Clock;
                  const badgeVariant = config?.variant ?? 'secondary';

                  return (
                    <div
                      key={entry.id}
                      className='flex items-center justify-between px-6 py-4 transition-colors hover:bg-[var(--color-interactive-hover)]'
                    >
                      <div className='flex items-center gap-3'>
                        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                          <IconComponent className='h-4 w-4 text-secondary-token' />
                        </div>
                        <div>
                          <p className='text-sm font-medium text-primary-token'>
                            {formatEventType(entry.eventType)}
                          </p>
                          <Badge
                            variant={badgeVariant}
                            size='sm'
                            className='mt-0.5'
                          >
                            {entry.source === 'webhook'
                              ? 'Stripe'
                              : entry.source}
                          </Badge>
                        </div>
                      </div>
                      <time className='shrink-0 text-xs text-tertiary-token'>
                        {formatDate(entry.createdAt)}
                      </time>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className='p-8 text-center'>
              <Clock className='mx-auto h-8 w-8 text-tertiary-token' />
              <p className='mt-3 text-sm text-secondary-token'>
                No billing events yet.
              </p>
              <p className='mt-1 text-xs text-tertiary-token'>
                Events will appear here as your subscription activity changes.
              </p>
            </CardContent>
          </Card>
        ))}
    </motion.div>
  );
}
