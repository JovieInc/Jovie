'use client';

import { Button, ConfirmDialog } from '@jovie/ui';
import { CreditCard, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { track } from '@/lib/analytics';
import { PRO_PLAN_DISPLAY_NAME } from '@/lib/config/plan-prices';
import { getLimit } from '@/lib/entitlements/registry';
import { LINEAR_EASE } from './billing-constants';

const PRO_RETENTION_DAYS = getLimit('pro', 'analyticsRetentionDays');
const FREE_RETENTION_DAYS = getLimit('free', 'analyticsRetentionDays');
const FREE_CONTACTS_LIMIT = getLimit('free', 'contactsLimit');

export function BillingActionsSection({
  cancelDialogOpen,
  setCancelDialogOpen,
  handleCancelSubscription,
  cancelMutationPending,
}: {
  readonly cancelDialogOpen: boolean;
  readonly setCancelDialogOpen: (open: boolean) => void;
  readonly handleCancelSubscription: () => void;
  readonly cancelMutationPending: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: LINEAR_EASE }}
    >
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Manage Subscription'
          subtitle='Billing portal access and cancellation controls.'
          className='px-4 py-3'
        />
        <div className='flex flex-col gap-3 px-4 py-4 sm:flex-row'>
          <BillingPortalLink variant='secondary' size='sm'>
            <CreditCard className='mr-2 h-4 w-4' />
            Payment &amp; Invoices
          </BillingPortalLink>

          <Button
            variant='ghost'
            size='sm'
            className='justify-start text-error hover:bg-error-subtle hover:text-error'
            onClick={() => {
              track('subscription_cancel_clicked', {
                source: 'billing_dashboard',
              });
              setCancelDialogOpen(true);
            }}
          >
            <XCircle className='mr-2 h-4 w-4' />
            Cancel Subscription
          </Button>

          <ConfirmDialog
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
            title='Cancel your subscription?'
            body={
              <div className='space-y-3'>
                <p>
                  Your {PRO_PLAN_DISPLAY_NAME} access continues until the end of
                  your current billing period. After that, you&apos;ll lose
                  access to:
                </p>
                <ul className='space-y-2'>
                  <li className='flex items-start gap-2'>
                    <XCircle
                      className='mt-0.5 h-4 w-4 shrink-0 text-error'
                      aria-hidden='true'
                    />
                    <span>
                      <strong>Advanced analytics</strong> - Retention drops from{' '}
                      {PRO_RETENTION_DAYS} days to {FREE_RETENTION_DAYS} days
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <XCircle
                      className='mt-0.5 h-4 w-4 shrink-0 text-error'
                      aria-hidden='true'
                    />
                    <span>
                      <strong>Contact export</strong> - You won&apos;t be able
                      to export audience contacts
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <XCircle
                      className='mt-0.5 h-4 w-4 shrink-0 text-error'
                      aria-hidden='true'
                    />
                    <span>
                      <strong>Unlimited saved contacts</strong> - Saved contact
                      limit drops to {FREE_CONTACTS_LIMIT}
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <XCircle
                      className='mt-0.5 h-4 w-4 shrink-0 text-error'
                      aria-hidden='true'
                    />
                    <span>
                      <strong>Self-filtering</strong> - Your own visits will
                      count in analytics
                    </span>
                  </li>
                </ul>
                <p className='text-secondary-token'>
                  You won&apos;t be charged again. You can re-subscribe any
                  time.
                </p>
              </div>
            }
            cancelLabel='Keep Subscription'
            confirmLabel='Cancel Subscription'
            variant='destructive'
            onConfirm={handleCancelSubscription}
            isLoading={cancelMutationPending}
          />
        </div>
      </ContentSurfaceCard>
    </motion.div>
  );
}
