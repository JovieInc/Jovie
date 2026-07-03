'use client';

import { Button } from '@jovie/ui';
import { CreditCard, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { track } from '@/lib/analytics';
import { LINEAR_EASE } from './billing-constants';

function CancelSubscriptionDescription() {
  return (
    <div className='space-y-3'>
      <p>
        Your Pro access continues until the end of your current billing period.
        After that, you&apos;ll lose access to:
      </p>
      <ul className='space-y-2'>
        <li className='flex items-start gap-2 text-app'>
          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-error' />
          <span>
            <strong>Branding removal</strong> - Jovie branding will reappear on
            your profile
          </span>
        </li>
        <li className='flex items-start gap-2'>
          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-error' />
          <span>
            <strong>Advanced analytics</strong> - Retention drops from 90 days
            to 7 days
          </span>
        </li>
        <li className='flex items-start gap-2'>
          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-error' />
          <span>
            <strong>Contact export</strong> - You won&apos;t be able to export
            audience contacts
          </span>
        </li>
        <li className='flex items-start gap-2'>
          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-error' />
          <span>
            <strong>Unlimited contacts</strong> - Contact limit drops to 100
          </span>
        </li>
        <li className='flex items-start gap-2'>
          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-error' />
          <span>
            <strong>Self-filtering</strong> - Your own visits will count in
            analytics
          </span>
        </li>
      </ul>
      <p className='text-secondary-token'>
        You won&apos;t be charged again. You can re-subscribe any time.
      </p>
    </div>
  );
}

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
            destructive
            className='justify-start'
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
        </div>
      </ContentSurfaceCard>

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title='Cancel your subscription?'
        description={<CancelSubscriptionDescription />}
        confirmLabel='Yes, Cancel'
        cancelLabel='Keep Subscription'
        variant='destructive'
        onConfirm={handleCancelSubscription}
        isLoading={cancelMutationPending}
      />
    </motion.div>
  );
}
