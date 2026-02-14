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
  Card,
  CardContent,
} from '@jovie/ui';
import { CreditCard, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
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
      <Card>
        <CardContent className='p-6'>
          <h2 className='mb-4 text-lg font-semibold text-primary-token'>
            Manage Subscription
          </h2>
          <div className='flex flex-col gap-3 sm:flex-row'>
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
                  className='text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/10'
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
                      <ul className='space-y-2 text-sm'>
                        <li className='flex items-start gap-2'>
                          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                          <span>
                            <strong>Branding removal</strong> &mdash; Jovie
                            branding will reappear on your profile
                          </span>
                        </li>
                        <li className='flex items-start gap-2'>
                          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                          <span>
                            <strong>Advanced analytics</strong> &mdash;
                            Retention drops from 90 days to 7 days
                          </span>
                        </li>
                        <li className='flex items-start gap-2'>
                          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                          <span>
                            <strong>Contact export</strong> &mdash; You
                            won&apos;t be able to export audience contacts
                          </span>
                        </li>
                        <li className='flex items-start gap-2'>
                          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                          <span>
                            <strong>Unlimited contacts</strong> &mdash; Contact
                            limit drops to 100
                          </span>
                        </li>
                        <li className='flex items-start gap-2'>
                          <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                          <span>
                            <strong>Self-filtering</strong> &mdash; Your own
                            visits will count in analytics
                          </span>
                        </li>
                      </ul>
                      <p className='text-secondary-token'>
                        This takes effect immediately. You can re-subscribe at
                        any time.
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
        </CardContent>
      </Card>
    </motion.div>
  );
}
