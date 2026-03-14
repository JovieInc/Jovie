'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@jovie/ui';
import { CreditCard, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { track } from '@/lib/analytics';
import { LINEAR_EASE } from './billing-constants';

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

          <AlertDialog
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant='ghost'
                size='sm'
                className='justify-start text-destructive hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/10'
                onClick={() => {
                  track('subscription_cancel_clicked', {
                    source: 'billing_dashboard',
                  });
                }}
              >
                <XCircle className='mr-2 h-4 w-4' />
                Cancel Subscription
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className='space-y-3'>
                    <p>
                      If you cancel, you will immediately lose access to these
                      features:
                    </p>
                    <ul className='space-y-2'>
                      <li className='flex items-start gap-2 text-[13px]'>
                        <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
                        <span>
                          <strong>Branding removal</strong> - Jovie branding
                          will reappear on your profile
                        </span>
                      </li>
                      <li className='flex items-start gap-2'>
                        <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
                        <span>
                          <strong>Advanced analytics</strong> - Retention drops
                          from 90 days to 7 days
                        </span>
                      </li>
                      <li className='flex items-start gap-2'>
                        <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
                        <span>
                          <strong>Contact export</strong> - You won&apos;t be
                          able to export audience contacts
                        </span>
                      </li>
                      <li className='flex items-start gap-2'>
                        <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
                        <span>
                          <strong>Unlimited contacts</strong> - Contact limit
                          drops to 100
                        </span>
                      </li>
                      <li className='flex items-start gap-2'>
                        <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
                        <span>
                          <strong>Self-filtering</strong> - Your own visits will
                          count in analytics
                        </span>
                      </li>
                    </ul>
                    <p className='text-(--linear-text-secondary)'>
                      This takes effect immediately. You can re-subscribe at any
                      time.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCancelSubscription}
                  disabled={cancelMutationPending}
                  className='bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
                >
                  {cancelMutationPending ? 'Cancelling...' : 'Yes, Cancel'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </ContentSurfaceCard>
    </motion.div>
  );
}
