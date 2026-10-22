import { Check } from 'lucide-react';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
  type PublicPricingClaimPlan,
} from '@/lib/billing/offer-truth';
import { cn } from '@/lib/utils';
import './MarketingProductStates.css';

export interface MarketingOfferInclusion {
  /** Plain-language row shown to the visitor. */
  readonly label: string;
  /**
   * The `PRICING_COMPARISON` feature name (lib/entitlements/registry.ts) that
   * proves the plan includes this row. Page contract tests resolve it.
   */
  readonly entitlement: string;
}

export interface MarketingOfferSummaryProps {
  /**
   * The public plan to summarize. Price, badge, and terms always come from
   * `lib/billing/offer-truth.ts`; this component has no price prop on purpose,
   * so a page cannot render a price that billing does not sell.
   */
  readonly plan: PublicPricingClaimPlan;
  /** Group label for the inclusions list. */
  readonly includedLabel: string;
  /** Rows that each map to a shipped entitlement. */
  readonly included: readonly MarketingOfferInclusion[];
  /**
   * Show the plan's terms note from offer truth. Pricing surfaces keep it;
   * a page that links to /pricing for terms may hide it.
   */
  readonly showTerms?: boolean;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Canonical marketing offer summary: price + terms from offer truth, then
 * what the plan includes. Use it wherever a marketing page states an offer.
 */
export function MarketingOfferSummary({
  plan,
  includedLabel,
  included,
  showTerms = true,
  className,
  testId = 'marketing-offer-summary',
}: Readonly<MarketingOfferSummaryProps>) {
  const claim = getPublicPriceClaim(plan);
  const listId = `${testId}-included`;

  return (
    <div
      className={cn('marketing-offer-summary', className)}
      data-testid={testId}
      data-offer-plan={claim.plan}
    >
      <p className='marketing-offer-summary__price'>
        <span className='marketing-offer-summary__amount tabular-nums'>
          {formatPublicPriceDisplay(claim)}
        </span>
        <span className='marketing-offer-summary__badge'>{claim.badge}</span>
      </p>
      {showTerms ? (
        <p className='marketing-offer-summary__note'>{claim.note}</p>
      ) : null}
      <p id={listId} className='marketing-offer-summary__label'>
        {includedLabel}
      </p>
      <ul aria-labelledby={listId} className='marketing-offer-summary__list'>
        {included.map(item => (
          <li
            key={item.entitlement}
            className='marketing-offer-summary__item'
            data-entitlement={item.entitlement}
          >
            <Check
              aria-hidden='true'
              className='marketing-offer-summary__check'
              strokeWidth={2}
            />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
