'use client';

import { Check, Minus } from 'lucide-react';
import { useState } from 'react';
import {
  type ComparisonFeature,
  ENTITLEMENT_REGISTRY,
  PRICING_COMPARISON,
} from '@/lib/entitlements/registry';
import { publicEnv } from '@/lib/env-public';

const growthPlanEnabled = publicEnv.NEXT_PUBLIC_FEATURE_GROWTH_PLAN === 'true';

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
      className='mx-auto'
      style={{
        width: '14px',
        height: '14px',
        color: 'var(--linear-text-quaternary)',
      }}
    />
  );
}

function FeatureRow({ feature }: { readonly feature: ComparisonFeature }) {
  return (
    <tr
      className='border-b'
      style={{ borderColor: 'var(--linear-border-subtle)' }}
    >
      <td
        className='py-3 pr-4 text-[13px]'
        style={{ color: 'var(--linear-text-secondary)' }}
      >
        {feature.name}
      </td>
      <td className='py-3 text-center px-2'>
        <CellValue
          value={feature.free}
          comingSoon={feature.comingSoon && feature.free !== false}
        />
      </td>
      <td
        className='py-3 text-center px-2'
        style={{ backgroundColor: 'var(--linear-bg-surface-1)' }}
      >
        <CellValue
          value={feature.pro}
          comingSoon={feature.comingSoon && feature.pro !== false}
        />
      </td>
      {growthPlanEnabled && (
        <td className='py-3 text-center px-2'>
          <CellValue value={feature.growth} comingSoon={feature.comingSoon} />
        </td>
      )}
    </tr>
  );
}

export function PricingComparisonChart() {
  const [isAnnual, setIsAnnual] = useState(false);

  const free = ENTITLEMENT_REGISTRY.free;
  const founding = ENTITLEMENT_REGISTRY.founding;
  const pro = ENTITLEMENT_REGISTRY.pro;
  const growth = ENTITLEMENT_REGISTRY.growth;

  const proPrice =
    isAnnual && pro.marketing.price?.yearly
      ? Math.round(pro.marketing.price.yearly / 12)
      : (pro.marketing.price?.monthly ?? 0);

  const growthPrice =
    isAnnual && growth.marketing.price?.yearly
      ? Math.round(growth.marketing.price.yearly / 12)
      : (growth.marketing.price?.monthly ?? 0);

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
            Save ~25%
          </span>
        </span>
      </div>

      {/* Comparison table */}
      <div
        className='overflow-x-auto rounded-lg'
        style={{
          border: '1px solid var(--linear-border-default)',
          backgroundColor: 'var(--linear-bg-surface-0)',
        }}
      >
        <table className='w-full border-collapse'>
          {/* Plan headers */}
          <thead>
            <tr
              className='border-b'
              style={{ borderColor: 'var(--linear-border-default)' }}
            >
              <th className='w-[40%] p-4 text-left' />
              {/* Free */}
              <th className='p-4 text-center min-w-[120px]'>
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
              {/* Pro (with Founding callout) */}
              <th
                className='p-4 text-center min-w-[160px]'
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
                <div
                  className='mt-2 rounded-md px-2 py-1 text-[11px]'
                  style={{
                    backgroundColor: 'var(--linear-bg-surface-2)',
                    border: '1px solid var(--linear-border-subtle)',
                    color: 'var(--linear-text-secondary)',
                  }}
                >
                  {founding.marketing.displayName}: $
                  {founding.marketing.price?.monthly}/mo locked in
                </div>
              </th>
              {/* Growth */}
              {growthPlanEnabled && (
                <th className='p-4 text-center min-w-[140px]'>
                  <div className='flex items-center justify-center gap-1.5'>
                    <span
                      className='text-[13px] font-medium'
                      style={{ color: 'var(--linear-text-tertiary)' }}
                    >
                      {growth.marketing.displayName}
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
                    ${growthPrice}
                    <span
                      className='text-[13px] font-normal'
                      style={{ color: 'var(--linear-text-tertiary)' }}
                    >
                      /mo
                    </span>
                  </div>
                  {isAnnual && growth.marketing.price?.yearly && (
                    <div
                      className='mt-0.5 text-[11px]'
                      style={{ color: 'var(--linear-text-tertiary)' }}
                    >
                      ${growth.marketing.price.yearly}/yr
                    </div>
                  )}
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {PRICING_COMPARISON.map(category => (
              <>
                {/* Category header */}
                <tr
                  key={`cat-${category.category}`}
                  style={{ backgroundColor: 'var(--linear-bg-page)' }}
                >
                  <td
                    colSpan={growthPlanEnabled ? 4 : 3}
                    className='px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider'
                    style={{ color: 'var(--linear-text-tertiary)' }}
                  >
                    {category.category}
                  </td>
                </tr>
                {/* Feature rows */}
                {category.features.map(feature => (
                  <FeatureRow key={`feat-${feature.name}`} feature={feature} />
                ))}
              </>
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
