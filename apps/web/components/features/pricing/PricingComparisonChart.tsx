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
      <span
        className='text-[13px]'
        style={{ color: 'var(--linear-text-secondary)' }}
      >
        {value}
        {comingSoon && (
          <span
            role='img'
            aria-label='Coming soon'
            className='ml-1.5 inline-block rounded-full px-1.5 py-px text-[10px] font-medium'
            style={{
              backgroundColor: 'var(--linear-warning-subtle)',
              color: 'var(--linear-warning)',
            }}
          >
            Soon
          </span>
        )}
      </span>
    );
  }
  if (value === true) {
    return (
      <Check
        aria-label='Included'
        className='mx-auto'
        style={{
          width: '16px',
          height: '16px',
          color: 'var(--linear-text-secondary)',
        }}
      />
    );
  }
  if (comingSoon) {
    return (
      <span
        role='img'
        aria-label='Coming soon'
        className='inline-block rounded-full px-1.5 py-px text-[10px] font-medium'
        style={{
          backgroundColor: 'var(--linear-warning-subtle)',
          color: 'var(--linear-warning)',
        }}
      >
        Soon
      </span>
    );
  }
  return (
    <Minus
      aria-label='Not included'
      className='mx-auto'
      style={{
        width: '14px',
        height: '14px',
        color: 'var(--linear-text-quaternary)',
      }}
    />
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
    <tr
      className='border-b'
      style={{ borderColor: 'var(--linear-border-subtle)' }}
    >
      <th
        scope='row'
        className='px-5 py-3.5 pr-4 text-[13px]'
        style={{ color: 'var(--linear-text-secondary)' }}
      >
        {feature.name}
      </th>
      <td
        className='px-5 py-3.5 text-center'
        style={
          selectedPlan === 'pro'
            ? { backgroundColor: 'var(--linear-bg-surface-1)' }
            : undefined
        }
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
    <tr
      className='border-b'
      style={{ borderColor: 'var(--linear-border-subtle)' }}
    >
      <th
        scope='row'
        className='px-5 py-3.5 pr-4 text-[13px]'
        style={{ color: 'var(--linear-text-secondary)' }}
      >
        {feature.name}
      </th>
      <td className='px-5 py-3.5 text-center'>
        <CellValue
          value={feature.free}
          comingSoon={feature.comingSoon && feature.free !== false}
        />
      </td>
      <td
        className='px-5 py-3.5 text-center'
        style={{ backgroundColor: 'var(--linear-bg-surface-1)' }}
      >
        <CellValue
          value={feature.pro}
          comingSoon={feature.comingSoon && feature.pro !== false}
        />
      </td>
      {maxPlanEnabled && (
        <td className='px-5 py-3.5 text-center'>
          <CellValue value={feature.max} comingSoon={feature.comingSoon} />
        </td>
      )}
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

  return (
    <div className='mx-auto max-w-5xl'>
      {/* Billing toggle */}
      <div className='flex items-center justify-center gap-3 mb-8'>
        <span
          className='text-[13px] font-medium'
          style={{
            color: isAnnual
              ? 'var(--linear-text-tertiary)'
              : 'var(--linear-text-primary)',
          }}
        >
          Monthly
        </span>
        <button
          type='button'
          role='switch'
          aria-checked={isAnnual}
          aria-label='Toggle annual billing'
          onClick={() => setIsAnnual(v => !v)}
          className='relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200'
          style={{
            backgroundColor: isAnnual
              ? 'var(--linear-btn-primary-bg)'
              : 'var(--linear-bg-surface-2)',
          }}
        >
          <span
            className='pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-sm transition-transform duration-200'
            style={{
              backgroundColor: 'var(--linear-text-primary)',
              transform: isAnnual
                ? 'translate(22px, 2px)'
                : 'translate(2px, 2px)',
            }}
          />
        </button>
        <span
          className='text-[13px] font-medium'
          style={{
            color: isAnnual
              ? 'var(--linear-text-primary)'
              : 'var(--linear-text-tertiary)',
          }}
        >
          {'Annual'}
          <span
            className='ml-1.5 inline-block rounded-full px-1.5 py-px text-[10px] font-medium'
            style={{
              backgroundColor: 'var(--linear-success-subtle)',
              color: 'var(--linear-success)',
            }}
          >
            Save ~20%
          </span>
        </span>
      </div>

      {/* Mobile plan selector */}
      <div className='mb-4 md:hidden'>
        <select
          aria-label='Select plan to compare'
          value={selectedPlan}
          onChange={e => {
            const val = e.target.value;
            if (planOptions.some(o => o.id === val)) {
              setSelectedPlan(val as PlanColumn);
            }
          }}
          className='w-full rounded-lg px-4 py-2.5 text-[14px] font-medium appearance-none cursor-pointer'
          style={{
            backgroundColor: 'var(--linear-bg-surface-1)',
            border: '1px solid var(--linear-border-default)',
            color: 'var(--linear-text-primary)',
          }}
        >
          {planOptions.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.name} — {opt.price}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop comparison table */}
      <div
        className='hidden overflow-x-auto rounded-[1.5rem] border p-3 md:block'
        style={{
          backgroundColor: 'var(--linear-bg-surface-0)',
          borderColor: 'var(--linear-border-default)',
        }}
      >
        <table className='w-full border-separate border-spacing-0'>
          <thead>
            <tr
              className='border-b'
              style={{ borderColor: 'var(--linear-border-default)' }}
            >
              <th className='w-[40%] px-5 py-5 text-left' />
              {/* Free */}
              <th className='min-w-[120px] px-5 py-5 text-center'>
                <div
                  className='text-[13px] font-medium'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  {free.marketing.displayName}
                </div>
                <div
                  className='mt-1 text-2xl font-semibold'
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  $0
                </div>
              </th>
              {/* Pro */}
              <th
                className='min-w-[160px] px-5 py-5 text-center'
                style={{ backgroundColor: 'var(--linear-bg-surface-1)' }}
              >
                <div
                  className='text-[13px] font-medium'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  {pro.marketing.displayName}
                </div>
                <div
                  className='mt-1 text-2xl font-semibold'
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  ${proPrice}
                  <span
                    className='text-[13px] font-normal'
                    style={{ color: 'var(--linear-text-tertiary)' }}
                  >
                    /mo
                  </span>
                </div>
                {isAnnual && pro.marketing.price?.yearly && (
                  <div
                    className='mt-0.5 text-[11px]'
                    style={{ color: 'var(--linear-text-tertiary)' }}
                  >
                    ${pro.marketing.price.yearly}/yr
                  </div>
                )}
              </th>
              {/* Max */}
              {maxPlanEnabled && (
                <th className='min-w-[140px] px-5 py-5 text-center'>
                  <div className='flex items-center justify-center gap-1.5'>
                    <span
                      className='text-[13px] font-medium'
                      style={{ color: 'var(--linear-text-tertiary)' }}
                    >
                      {max.marketing.displayName}
                    </span>
                    <span
                      className='rounded-full px-1.5 py-px text-[10px] font-medium'
                      style={{
                        backgroundColor: 'var(--linear-warning-subtle)',
                        color: 'var(--linear-warning)',
                      }}
                    >
                      Early Access
                    </span>
                  </div>
                  <div
                    className='mt-1 text-2xl font-semibold'
                    style={{ color: 'var(--linear-text-primary)' }}
                  >
                    ${maxPrice}
                    <span
                      className='text-[13px] font-normal'
                      style={{ color: 'var(--linear-text-tertiary)' }}
                    >
                      /mo
                    </span>
                  </div>
                  {isAnnual && max.marketing.price?.yearly && (
                    <div
                      className='mt-0.5 text-[11px]'
                      style={{ color: 'var(--linear-text-tertiary)' }}
                    >
                      ${max.marketing.price.yearly}/yr
                    </div>
                  )}
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {PRICING_COMPARISON.map(category => (
              <Fragment key={`cat-${category.category}`}>
                <tr style={{ backgroundColor: 'var(--linear-bg-page)' }}>
                  <td
                    colSpan={maxPlanEnabled ? 4 : 3}
                    className='px-5 py-3 text-[12px] font-semibold tracking-[0.04em]'
                    style={{ color: 'var(--linear-text-tertiary)' }}
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

      {/* Mobile comparison table */}
      <div
        className='overflow-x-auto rounded-[1.5rem] border p-3 md:hidden'
        style={{
          backgroundColor: 'var(--linear-bg-surface-0)',
          borderColor: 'var(--linear-border-default)',
        }}
      >
        <table className='w-full border-separate border-spacing-0'>
          <thead>
            <tr
              className='border-b'
              style={{ borderColor: 'var(--linear-border-default)' }}
            >
              <th className='w-[60%] px-5 py-5 text-left' />
              <th
                className='px-5 py-5 text-center'
                style={
                  selectedPlan === 'pro'
                    ? { backgroundColor: 'var(--linear-bg-surface-1)' }
                    : undefined
                }
              >
                <div
                  className='text-[13px] font-medium'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  {planOptions.find(o => o.id === selectedPlan)?.name}
                </div>
                <div
                  className='mt-1 text-xl font-semibold'
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  {planOptions.find(o => o.id === selectedPlan)?.price}
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {PRICING_COMPARISON.map(category => (
              <Fragment key={`mcat-${category.category}`}>
                <tr style={{ backgroundColor: 'var(--linear-bg-page)' }}>
                  <td
                    colSpan={2}
                    className='px-5 py-3 text-[12px] font-semibold tracking-[0.04em]'
                    style={{ color: 'var(--linear-text-tertiary)' }}
                  >
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

      <p
        className='mt-4 text-center'
        style={{
          fontSize: 'var(--linear-label-size)',
          color: 'var(--linear-text-tertiary)',
        }}
      >
        All limits subject to fair-use guardrails.
      </p>
    </div>
  );
}
