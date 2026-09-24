'use client';

import { Check, Minus } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';
import {
  type ComparisonFeature,
  PRICING_COMPARISON,
} from '@/lib/entitlements/registry';

const PUBLIC_PRICING_FEATURE_NAMES = new Set([
  'Public artist profile page',
  'Contact / subscriber capture',
]);

const PUBLIC_PRICING_COMPARISON = PRICING_COMPARISON.map(category => ({
  ...category,
  features: category.features.filter(feature =>
    PUBLIC_PRICING_FEATURE_NAMES.has(feature.name)
  ),
})).filter(category => category.features.length > 0);

type PlanColumn = 'free' | 'pro';

function CellValue({
  value,
  comingSoon,
}: {
  readonly value: boolean | string;
  readonly comingSoon?: boolean;
}) {
  if (typeof value === 'string') {
    return (
      <span className='system-b-pricing-chart-value'>
        {value}
        {comingSoon ? (
          <span className='system-b-pricing-chart-badge'>Soon</span>
        ) : null}
      </span>
    );
  }

  if (value === true) {
    return (
      <Check
        aria-label='Included'
        className='system-b-pricing-inclusion-icon'
      />
    );
  }

  if (comingSoon) {
    return <span className='system-b-pricing-chart-badge'>Soon</span>;
  }

  return (
    <Minus aria-label='Not Included' className='system-b-pricing-minus-icon' />
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
        className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature whitespace-nowrap'
      >
        {feature.name}
      </th>
      <td
        className='system-b-pricing-chart-cell system-b-pricing-chart-cell--value'
        data-selected={selectedPlan === 'pro' ? 'true' : undefined}
      >
        <CellValue
          value={feature[selectedPlan]}
          comingSoon={feature.comingSoon && feature[selectedPlan] !== false}
        />
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
        <CellValue
          value={feature.free}
          comingSoon={feature.comingSoon && feature.free !== false}
        />
      </td>
      <td
        className='system-b-pricing-chart-cell system-b-pricing-chart-cell--value'
        data-selected='true'
      >
        <CellValue
          value={feature.pro}
          comingSoon={feature.comingSoon && feature.pro !== false}
        />
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

  return (
    <div className='system-b-pricing-chart'>
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
              <th className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature-heading whitespace-nowrap' />
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
              <th className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature-heading whitespace-nowrap' />
              <th
                className='system-b-pricing-chart-cell system-b-pricing-chart-cell--plan whitespace-nowrap'
                data-selected={selectedPlan === 'pro' ? 'true' : undefined}
              >
                <div className='system-b-pricing-plan-name'>
                  {selectedPlanOption.name}
                </div>
                <div className='system-b-pricing-plan-price'>
                  {selectedPlanOption.price}
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
