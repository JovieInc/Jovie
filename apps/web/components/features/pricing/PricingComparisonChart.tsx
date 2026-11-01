'use client';

import { Fragment, useState } from 'react';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import {
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';
import { PUBLIC_PRICING_COMPARISON } from '@/lib/billing/public-pricing-features';
import type { ComparisonFeature } from '@/lib/entitlements/registry';

/** Plans the public comparison shows (Max is legacy-only, not sold). */
type PlanColumn = 'free' | 'pro';

function CellValue({ value }: { readonly value: boolean | string }) {
  if (typeof value === 'string') {
    return <span className='system-b-pricing-chart-value'>{value}</span>;
  }

  return (
    <span
      className='system-b-pricing-chart-value'
      data-included={value ? 'true' : 'false'}
    >
      {value ? 'Included' : 'Not included'}
    </span>
  );
}

function MobileFeatureRow({
  feature,
  selectedPlan,
}: {
  readonly feature: ComparisonFeature;
  readonly selectedPlan: PlanColumn;
}) {
  return (
    <tr className='system-b-pricing-chart-row'>
      <th
        scope='row'
        data-wrap='feature-label'
        className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature'
      >
        {feature.name}
      </th>
      <td
        className='system-b-pricing-chart-cell system-b-pricing-chart-cell--value'
        data-selected={selectedPlan === 'pro' ? 'true' : undefined}
      >
        <CellValue value={feature[selectedPlan]} />
      </td>
    </tr>
  );
}

function DesktopFeatureRow({
  feature,
}: {
  readonly feature: ComparisonFeature;
}) {
  return (
    <tr className='system-b-pricing-chart-row'>
      <th
        scope='row'
        className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature whitespace-nowrap'
      >
        {feature.name}
      </th>
      <td className='system-b-pricing-chart-cell system-b-pricing-chart-cell--value'>
        <CellValue value={feature.free} />
      </td>
      <td
        className='system-b-pricing-chart-cell system-b-pricing-chart-cell--value'
        data-selected='true'
      >
        <CellValue value={feature.pro} />
      </td>
    </tr>
  );
}

export function PricingComparisonChart() {
  const [selectedPlan, setSelectedPlan] = useState<PlanColumn>('pro');

  const freeClaim = getPublicPriceClaim('free');
  const proClaim = getPublicPriceClaim('pro');

  const planOptions: { id: PlanColumn; name: string; price: string }[] = [
    {
      id: 'free',
      name: freeClaim.displayName,
      price: formatPublicPriceDisplay(freeClaim),
    },
    {
      id: 'pro',
      name: proClaim.displayName,
      price: formatPublicPriceDisplay(proClaim),
    },
  ];
  const selectedPlanOption =
    planOptions.find(option => option.id === selectedPlan) ?? planOptions[0];
  const selectedPlanClaim = selectedPlan === 'free' ? freeClaim : proClaim;

  return (
    <div
      className='system-b-pricing-chart'
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.comparison}
      data-offer-contract={ARTIST_VISIBILITY_OFFER_CONTRACT_ID}
    >
      <div className='system-b-pricing-mobile-selector'>
        <select
          aria-label='Select Plan To Compare'
          value={selectedPlan}
          onChange={event => {
            const value = event.target.value;
            if (planOptions.some(option => option.id === value)) {
              setSelectedPlan(value as PlanColumn);
            }
          }}
          className='system-b-pricing-select'
        >
          {planOptions.map(option => (
            <option key={option.id} value={option.id}>
              {option.name} - {option.price}
            </option>
          ))}
        </select>
      </div>

      <div className='system-b-pricing-table-shell' data-variant='desktop'>
        <table className='system-b-pricing-table'>
          <caption className='sr-only'>Feature comparison by plan</caption>
          <thead>
            <tr className='system-b-pricing-chart-row'>
              <th
                scope='col'
                className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature-heading whitespace-nowrap'
              >
                <span className='sr-only'>Feature</span>
              </th>
              <th className='system-b-pricing-chart-cell system-b-pricing-chart-cell--plan whitespace-nowrap'>
                <div className='system-b-pricing-plan-name'>
                  {freeClaim.displayName}
                </div>
                <div className='system-b-pricing-plan-price'>
                  {formatPublicPriceDisplay(freeClaim)}
                </div>
              </th>
              <th
                className='system-b-pricing-chart-cell system-b-pricing-chart-cell--plan whitespace-nowrap'
                data-selected='true'
              >
                <div className='system-b-pricing-plan-name'>
                  {proClaim.displayName}
                </div>
                <div className='system-b-pricing-plan-price'>
                  {proClaim.priceLabel}
                  {proClaim.cadence ? <span>{proClaim.cadence}</span> : null}
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {PUBLIC_PRICING_COMPARISON.map(category => (
              <Fragment key={`cat-${category.category}`}>
                <tr className='system-b-pricing-category-row'>
                  <td colSpan={3} className='system-b-pricing-category-cell'>
                    {category.category}
                  </td>
                </tr>
                {category.features.map(feature => (
                  <DesktopFeatureRow
                    key={`feat-${feature.name}`}
                    feature={feature}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className='system-b-pricing-table-shell' data-variant='mobile'>
        <table className='system-b-pricing-table'>
          <caption className='sr-only'>
            Feature comparison for selected plan
          </caption>
          <thead>
            <tr className='system-b-pricing-chart-row'>
              <th
                scope='col'
                className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature-heading whitespace-nowrap'
              >
                <span className='sr-only'>Feature</span>
              </th>
              <th
                className='system-b-pricing-chart-cell system-b-pricing-chart-cell--plan whitespace-nowrap'
                data-selected={selectedPlan === 'pro' ? 'true' : undefined}
              >
                <div className='system-b-pricing-plan-name'>
                  {selectedPlanOption.name}
                </div>
                <div className='system-b-pricing-plan-price'>
                  {selectedPlanClaim.priceLabel}
                  {selectedPlanClaim.cadence ? (
                    <span>{selectedPlanClaim.cadence}</span>
                  ) : null}
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {PUBLIC_PRICING_COMPARISON.map(category => (
              <Fragment key={`mcat-${category.category}`}>
                <tr className='system-b-pricing-category-row'>
                  <td colSpan={2} className='system-b-pricing-category-cell'>
                    {category.category}
                  </td>
                </tr>
                {category.features.map(feature => (
                  <MobileFeatureRow
                    key={`mfeat-${feature.name}`}
                    feature={feature}
                    selectedPlan={selectedPlan}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className='system-b-pricing-footnote'>
        All limits subject to fair-use guardrails.
      </p>
    </div>
  );
}
