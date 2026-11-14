'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { Slot } from '@radix-ui/react-slot';
import { Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { track, useFeatureFlag } from '@/lib/analytics';
import {
  getArtistPresenceMonthlyPrice,
  normalizeUpgradeReturnTo,
} from '@/lib/billing/artist-presence-upgrade';
import { PRO_PLAN_DISPLAY_NAME } from '@/lib/config/plan-prices';
import { useCheckoutMutation, usePricingOptionsQuery } from '@/lib/queries';

interface UpgradeButtonProps {
  readonly className?: string;
  /** Compose an existing button (including tooltip triggers), retaining its label and style. */
  readonly asChild?: boolean;
  readonly children?: React.ReactNode;
  readonly variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly priceId?: string; // Default price ID for direct checkout
}

export function UpgradeButton({
  className,
  asChild = false,
  children = `Upgrade to ${PRO_PLAN_DISPLAY_NAME}`,
  variant = 'primary',
  size = 'md',
  priceId,
}: UpgradeButtonProps) {
  const router = useRouter();
  const checkoutMutation = useCheckoutMutation();

  // Check if direct upgrade is enabled
  const directUpgradeEnabled = useFeatureFlag('BILLING_UPGRADE_DIRECT');

  const pricing = usePricingOptionsQuery({
    enabled: directUpgradeEnabled && !priceId,
  });
  const resolvedPriceId =
    priceId || getArtistPresenceMonthlyPrice(pricing.data?.options ?? []);
  const checkoutStarted = useRef(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const resetCheckout = checkoutMutation.reset;
  useEffect(() => {
    const resume = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      checkoutStarted.current = false;
      setIsRedirecting(false);
      resetCheckout();
    };
    globalThis.addEventListener('pageshow', resume);
    return () => globalThis.removeEventListener('pageshow', resume);
  }, [resetCheckout]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (checkoutStarted.current || checkoutMutation.isPending) return;
    if (directUpgradeEnabled && !resolvedPriceId) return;
    // Track upgrade button click
    track('upgrade_button_clicked', {
      flow_type:
        directUpgradeEnabled && resolvedPriceId
          ? 'direct_checkout'
          : 'pricing_page',
      price_id: resolvedPriceId || null,
      feature_flag_enabled: directUpgradeEnabled,
    });

    if (directUpgradeEnabled && resolvedPriceId) {
      // Direct checkout flow - skip pricing page
      track('checkout_initiated', {
        flow_type: 'direct',
        price_id: resolvedPriceId,
      });

      checkoutStarted.current = true;
      setIsRedirecting(true);
      checkoutMutation.mutate(
        {
          priceId: resolvedPriceId,
          source: 'in_app',
          returnTo: normalizeUpgradeReturnTo(
            globalThis.location.pathname + globalThis.location.search
          ),
        },
        {
          onSuccess: data => {
            track('checkout_redirect', {
              flow_type: 'direct',
              price_id: resolvedPriceId,
            });
            // Redirect to Stripe checkout
            globalThis.location.href = data.url;
          },
          onError: error => {
            checkoutStarted.current = false;
            setIsRedirecting(false);
            const errorMessage =
              error instanceof Error
                ? error.message
                : 'Failed to create checkout session';
            track('checkout_failed', {
              flow_type: 'direct',
              price_id: resolvedPriceId,
              error: errorMessage,
            });
          },
        }
      );
    } else {
      // Traditional flow - redirect to pricing
      track('pricing_page_redirect', {
        flow_type: 'traditional',
      });
      router.push(APP_ROUTES.PRICING);
    }
  };

  const mappedSize: ButtonProps['size'] = size === 'md' ? 'default' : size;
  const isLoading =
    isRedirecting ||
    checkoutMutation.isPending ||
    (directUpgradeEnabled && !priceId && pricing.isPending);
  const unavailable = directUpgradeEnabled && !resolvedPriceId && !isLoading;
  const error = checkoutMutation.error;
  const statusId = useId();
  const unavailableMessage = 'Checkout is unavailable. Please try again later.';
  // Slot normally gives child props precedence. Checkout state must still win
  // when a composed button explicitly supplies disabled={false}.
  const child =
    asChild && isValidElement<ButtonProps>(children)
      ? cloneElement(children, {
          disabled: isLoading || unavailable || children.props.disabled,
          'aria-busy': isLoading || children.props['aria-busy'],
          'aria-describedby':
            unavailable || error
              ? statusId
              : children.props['aria-describedby'],
          title: unavailable ? unavailableMessage : children.props.title,
        })
      : children;

  return (
    <div className={className}>
      {asChild ? (
        <Slot onClick={handleClick} aria-busy={isLoading || undefined}>
          {child}
        </Slot>
      ) : (
        <Button
          onClick={handleClick}
          type='button'
          disabled={isLoading || unavailable}
          variant={variant}
          size={mappedSize}
          className='inline-flex items-center gap-2'
        >
          <Rocket className='h-4 w-4' />
          {isLoading ? 'Loading...' : children}
        </Button>
      )}
      {unavailable && (
        <p
          id={statusId}
          role='status'
          className='mt-2 text-sm text-secondary-token'
        >
          {unavailableMessage}
        </p>
      )}
      {/* The mutation already emits an error toast. Compact composed controls
          keep an accessible status without expanding their surrounding row. */}
      {error && !unavailable && (
        <p
          id={statusId}
          role='status'
          className={asChild ? 'sr-only' : 'mt-2 text-sm text-destructive'}
        >
          {error instanceof Error ? error.message : 'Failed to start checkout'}
        </p>
      )}
    </div>
  );
}
