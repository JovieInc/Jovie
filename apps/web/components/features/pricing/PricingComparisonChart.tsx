'use client';

import { Fragment, useState } from 'react';
import {
  FAN_SEND_OFFER_NOTE,
  MARKETING_PRICING_PLANS,
  type MarketingPricingPlanId as PlanColumn,
  ARTIST_VISIBILITY_COMPARISON as PRICING_COMPARISON,
} from '@/data/marketingPricingPlans';

type ComparisonFeature =
  (typeof PRICING_COMPARISON)[number]['features'][number];

function CellValue({ value }: { readonly value: string }) {
  return <span className='system-b-pricing-chart-value'>{value}</span>;
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
      <td className='system-b-pricing-chart-cell system-b-pricing-chart-cell--value'>
        <CellValue value={feature.enterprise} comingSoon={feature.comingSoon} />
      </td>
    </tr>
  );
}

export function PricingComparisonChart() {
  const [selectedPlan, setSelectedPlan] = useState<PlanColumn>('pro');
  const planOptions = MARKETING_PRICING_PLANS.map(plan => ({
    id: plan.id,
    name: plan.name,
    price: `${plan.price}${plan.cadence ?? ''}`,
  }));
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
              {planOptions.map(option => (
                <th
                  key={option.id}
                  scope='col'
                  className='system-b-pricing-chart-cell system-b-pricing-chart-cell--plan whitespace-nowrap'
                  data-selected={option.id === 'pro' ? 'true' : undefined}
                >
                  <div className='system-b-pricing-plan-name'>
                    {option.name}
                  </div>
                  <div className='system-b-pricing-plan-price'>
                    {option.price}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {PRICING_COMPARISON.map(category => (
              <Fragment key={`cat-${category.category}`}>
                <tr className='system-b-pricing-category-row'>
                  <td colSpan={4} className='system-b-pricing-category-cell'>
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
            {PRICING_COMPARISON.map(category => (
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

      <p className='system-b-pricing-footnote'>{FAN_SEND_OFFER_NOTE}</p>
    </div>
  );
}
