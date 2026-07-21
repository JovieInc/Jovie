'use client';

import { Check, Minus } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  type ComparisonFeature,
  ENTITLEMENT_REGISTRY,
  PRICING_COMPARISON,
} from '@/lib/entitlements/registry';
import { publicEnv } from '@/lib/env-public';

const maxPlanEnabled = publicEnv.NEXT_PUBLIC_FEATURE_MAX_PLAN === 'true';

type PlanColumn = 'free' | 'pro' | 'max';

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
    <Minus aria-label='Not included' className='system-b-pricing-minus-icon' />
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
        className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature'
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
        className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature'
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
      {maxPlanEnabled ? (
        <td className='system-b-pricing-chart-cell system-b-pricing-chart-cell--value'>
          <CellValue value={feature.max} comingSoon={feature.comingSoon} />
        </td>
      ) : null}
    </tr>
  );
}

export function PricingComparisonChart() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanColumn>('pro');

  const free = ENTITLEMENT_REGISTRY.free;
  const pro = ENTITLEMENT_REGISTRY.pro;
  const max = ENTITLEMENT_REGISTRY.max;

  const proPrice =
    isAnnual && pro.marketing.price?.yearly
      ? Math.round(pro.marketing.price.yearly / 12)
      : (pro.marketing.price?.monthly ?? 0);

  const maxPrice =
    isAnnual && max.marketing.price?.yearly
      ? Math.round(max.marketing.price.yearly / 12)
      : (max.marketing.price?.monthly ?? 0);

  const planOptions: { id: PlanColumn; name: string; price: string }[] = [
    { id: 'free', name: free.marketing.displayName, price: '$0' },
    { id: 'pro', name: pro.marketing.displayName, price: `$${proPrice}/mo` },
    ...(maxPlanEnabled
      ? [
          {
            id: 'max' as PlanColumn,
            name: max.marketing.displayName,
            price: `$${maxPrice}/mo`,
          },
        ]
      : []),
  ];
  const selectedPlanOption =
    planOptions.find(option => option.id === selectedPlan) ?? planOptions[0];

  return (
    <div className='system-b-pricing-chart'>
      <div className='system-b-pricing-billing'>
        <span
          className='system-b-pricing-billing-label'
          data-active={isAnnual ? undefined : 'true'}
        >
          Monthly
        </span>
        <button
          type='button'
          role='switch'
          aria-checked={isAnnual}
          aria-label='Toggle annual billing'
          onClick={() => setIsAnnual(value => !value)}
          className='system-b-pricing-switch'
          data-state={isAnnual ? 'annual' : 'monthly'}
        >
          <span className='system-b-pricing-switch-thumb' />
        </button>
        <span
          className='system-b-pricing-billing-label'
          data-active={isAnnual ? 'true' : undefined}
        >
          Annual
          <span className='system-b-pricing-chart-badge' data-tone='success'>
            Save ~20%
          </span>
        </span>
      </div>

      <div className='system-b-pricing-mobile-selector'>
        <select
          aria-label='Select plan to compare'
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
              <th className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature-heading' />
              <th className='system-b-pricing-chart-cell system-b-pricing-chart-cell--plan'>
                <div className='system-b-pricing-plan-name'>
                  {free.marketing.displayName}
                </div>
                <div className='system-b-pricing-plan-price'>$0</div>
              </th>
              <th
                className='system-b-pricing-chart-cell system-b-pricing-chart-cell--plan'
                data-selected='true'
              >
                <div className='system-b-pricing-plan-name'>
                  {pro.marketing.displayName}
                </div>
                <div className='system-b-pricing-plan-price'>
                  ${proPrice}
                  <span>/mo</span>
                </div>
                <div
                  aria-hidden={isAnnual ? undefined : true}
                  className='system-b-pricing-plan-annual'
                  data-visible={isAnnual ? 'true' : undefined}
                >
                  {pro.marketing.price?.yearly
                    ? `$${pro.marketing.price.yearly}/yr`
                    : null}
                </div>
              </th>
              {maxPlanEnabled ? (
                <th className='system-b-pricing-chart-cell system-b-pricing-chart-cell--plan'>
                  <div className='system-b-pricing-plan-label'>
                    <span className='system-b-pricing-plan-name'>
                      {max.marketing.displayName}
                    </span>
                    <span className='system-b-pricing-chart-badge'>
                      Early Access
                    </span>
                  </div>
                  <div className='system-b-pricing-plan-price'>
                    ${maxPrice}
                    <span>/mo</span>
                  </div>
                  <div
                    aria-hidden={isAnnual ? undefined : true}
                    className='system-b-pricing-plan-annual'
                    data-visible={isAnnual ? 'true' : undefined}
                  >
                    {max.marketing.price?.yearly
                      ? `$${max.marketing.price.yearly}/yr`
                      : null}
                  </div>
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody>
            {PRICING_COMPARISON.map(category => (
              <Fragment key={`cat-${category.category}`}>
                <tr className='system-b-pricing-category-row'>
                  <td
                    colSpan={maxPlanEnabled ? 4 : 3}
                    className='system-b-pricing-category-cell'
                  >
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
              <th className='system-b-pricing-chart-cell system-b-pricing-chart-cell--feature-heading' />
              <th
                className='system-b-pricing-chart-cell system-b-pricing-chart-cell--plan'
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

      <p className='system-b-pricing-footnote'>
        All limits subject to fair-use guardrails.
      </p>
    </div>
  );
}
