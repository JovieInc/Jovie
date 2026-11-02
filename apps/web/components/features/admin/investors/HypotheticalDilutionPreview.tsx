'use client';

import {
  Button,
  Checkbox,
  Field,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  type HypotheticalPricedRoundResult,
  previewHypotheticalPricedRound,
} from '@/lib/investors/hypothetical-dilution';
import { formatAmount } from '@/lib/utils/format-number';

// Limit UI inputs to $1T each: even their sum retains cent precision in the
// shared currency formatter's number / 100 conversion. Pure math has its own limit.
const MAX_UI_MONEY_MINOR = 100_000_000_000_000;
const MONEY_TEXT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const EMPTY = { ownership: '', valuation: '', committed: '', proposed: '' };
// Entirely synthetic. Never replace with company financing terms or CRM values.
const SYNTHETIC = {
  ownership: '72',
  valuation: '8000000',
  committed: '800000',
  proposed: '1200000',
};
const INSTRUMENTS = [
  { value: 'priced-equity', label: 'Priced Equity' },
  { value: 'safe', label: 'SAFE / Convertible Note (Unsupported)' },
  { value: 'mixed', label: 'Mixed / Other Terms (Unsupported)' },
];
const VALUATION_BASES = [
  { value: 'pre-money', label: 'Pre-money' },
  { value: 'post-money', label: 'Post-money (Full Scenario)' },
];
const PERCENT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

type Fields = typeof EMPTY;
type ValuationBasis = 'pre-money' | 'post-money';
type Success = Extract<HypotheticalPricedRoundResult, { ok: true }>;

function parseMoney(value: string): number | null {
  const text = value.trim();
  if (!MONEY_TEXT_PATTERN.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

function evaluate(fields: Fields, valuationBasis: ValuationBasis) {
  const ownership = /^\d+(?:\.\d+)?$/.test(fields.ownership.trim())
    ? Number(fields.ownership)
    : NaN;
  const valuation = parseMoney(fields.valuation);
  const committed = parseMoney(fields.committed);
  const proposed = parseMoney(fields.proposed);
  const errors = {
    ownership:
      Number.isFinite(ownership) && ownership >= 0 && ownership <= 100
        ? ''
        : 'Enter 0 to 100.',
    valuation:
      valuation !== null && valuation > 0 ? '' : 'Enter a positive amount.',
    committed: committed !== null ? '' : 'Enter an amount or zero.',
    proposed: proposed !== null ? '' : 'Enter an amount or zero.',
  };
  for (const field of ['valuation', 'committed', 'proposed'] as const) {
    const text = fields[field].trim();
    // Classify over-limit text even when converting it to minor units is unsafe.
    if (
      MONEY_TEXT_PATTERN.test(text) &&
      Number(text) > MAX_UI_MONEY_MINOR / 100
    ) {
      errors[field] = 'Maximum is $1 trillion.';
    }
  }
  let result: Success | null = null;
  let rangeError = '';
  if (!Object.values(errors).some(Boolean)) {
    const calculated = previewHypotheticalPricedRound({
      instrument: 'priced-equity',
      valuationBasis,
      valuationMinor: valuation ?? 0,
      ownershipBeforePercent: ownership,
      committedMinor: committed ?? 0,
      proposedMinor: proposed ?? 0,
      convertingSecurities: 'none',
      optionPoolChange: 'none',
      existingHolderInvestment: 'none',
    });
    if (calculated.ok) result = calculated;
    else if (calculated.error === 'nonpositive-pre-money') {
      errors.valuation = 'Must exceed all new cash.';
    } else {
      rangeError = 'Amounts exceed the supported numeric range.';
    }
  }
  return { errors, result, rangeError };
}

/** Local hypothetical state only. No props accept financing data or callbacks. */
export function HypotheticalDilutionPreview() {
  const id = useId();
  const [fields, setFields] = useState({ ...EMPTY });
  const [instrument, setInstrument] = useState('priced-equity');
  const [basis, setBasis] = useState<ValuationBasis>('pre-money');
  const [confirmed, setConfirmed] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const evaluation = evaluate(fields, basis);
  const supported = instrument === 'priced-equity';
  const result = supported && confirmed ? evaluation.result : null;
  let status = 'Enter a hypothetical scenario. Nothing is saved.';
  if (!supported) {
    status =
      'Unsupported terms. SAFEs, convertible notes and mixed instruments need a separate model.';
  } else if (confirmed) {
    status = result
      ? synthetic
        ? 'Synthetic example. Economic ownership only.'
        : 'Hypothetical estimate. Economic ownership only.'
      : evaluation.rangeError || 'Check the highlighted inputs.';
  } else if (Object.values(fields).some(Boolean)) {
    status = 'Confirm the assumptions to preview ownership.';
  }

  function updateField(field: keyof Fields, value: string) {
    setFields(previous => ({ ...previous, [field]: value }));
    setSynthetic(false);
  }

  function clear() {
    setFields({ ...EMPTY });
    setInstrument('priced-equity');
    setBasis('pre-money');
    setConfirmed(false);
    setSynthetic(false);
  }

  function loadExample() {
    setFields({ ...SYNTHETIC });
    setInstrument('priced-equity');
    setBasis('pre-money');
    setConfirmed(true);
    setSynthetic(true);
  }

  return (
    <section
      aria-label='Hypothetical Dilution Preview'
      className='ph-no-capture sentry-block'
      data-sentry-mask
    >
      <ContentSurfaceCard>
        <details className='group'>
          <summary className='flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl p-4 focus-ring-themed'>
            <h2 className='text-balance text-sm font-semibold text-primary-token'>
              Hypothetical Dilution
              <span className='ml-2 font-normal text-secondary-token'>
                Priced Equity · not saved
              </span>
            </h2>
            <ChevronDown
              aria-hidden='true'
              className='h-4 w-4 shrink-0 text-secondary-token group-open:rotate-180'
            />
          </summary>
          <div className='space-y-4 p-4 pt-0'>
            <p className='text-sm text-secondary-token'>
              Model new shares before they are issued. Enter a fully diluted
              baseline before all modeled cash; committed amounts are your
              unverified assumptions, separate from proposed checks.
            </p>
            <div className='grid gap-x-4 sm:grid-cols-2'>
              <ScenarioSelect
                id={`${id}-instrument`}
                label='Instrument'
                options={INSTRUMENTS}
                value={instrument}
                onValueChange={setInstrument}
              />
              <ScenarioSelect
                id={`${id}-basis`}
                label='Valuation Basis'
                options={VALUATION_BASES}
                value={basis}
                onValueChange={value => {
                  if (value !== 'pre-money' && value !== 'post-money') return;
                  setBasis(value);
                  setSynthetic(false);
                }}
              />
              <Field
                label='Ownership Before (%)'
                id={`${id}-ownership`}
                error={
                  supported && confirmed
                    ? evaluation.errors.ownership
                    : undefined
                }
              >
                <Input
                  inputMode='decimal'
                  autoComplete='off'
                  spellCheck={false}
                  value={fields.ownership}
                  onChange={event =>
                    updateField('ownership', event.target.value)
                  }
                  maxLength={24}
                />
              </Field>
              <Field
                label='Valuation (USD)'
                id={`${id}-valuation`}
                error={
                  supported && confirmed
                    ? evaluation.errors.valuation
                    : undefined
                }
              >
                <Input
                  inputMode='decimal'
                  autoComplete='off'
                  spellCheck={false}
                  value={fields.valuation}
                  onChange={event =>
                    updateField('valuation', event.target.value)
                  }
                  maxLength={24}
                  aria-describedby={`${id}-valuation-note`}
                />
              </Field>
              <Field
                label='Committed, Unissued Cash (USD)'
                id={`${id}-committed`}
                error={
                  supported && confirmed
                    ? evaluation.errors.committed
                    : undefined
                }
              >
                <Input
                  inputMode='decimal'
                  autoComplete='off'
                  spellCheck={false}
                  value={fields.committed}
                  onChange={event =>
                    updateField('committed', event.target.value)
                  }
                  maxLength={24}
                />
              </Field>
              <Field
                label='Proposed Cash (USD)'
                id={`${id}-proposed`}
                error={
                  supported && confirmed
                    ? evaluation.errors.proposed
                    : undefined
                }
              >
                <Input
                  inputMode='decimal'
                  autoComplete='off'
                  spellCheck={false}
                  value={fields.proposed}
                  onChange={event =>
                    updateField('proposed', event.target.value)
                  }
                  maxLength={24}
                />
              </Field>
            </div>
            <p
              id={`${id}-valuation-note`}
              className='text-xs text-secondary-token'
            >
              Post-money includes committed + proposed cash. Both comparisons
              use the same derived pre-money value and share price. Enter zero
              for cash you are not modeling.
            </p>
            <label
              htmlFor={`${id}-confirmed`}
              className='flex min-h-11 cursor-pointer items-start gap-3 text-sm text-secondary-token'
            >
              <Checkbox
                id={`${id}-confirmed`}
                checked={confirmed}
                onCheckedChange={value => setConfirmed(value === true)}
                className='mt-1'
                aria-describedby={`${id}-assumptions`}
              />
              <span id={`${id}-assumptions`}>
                These assumptions apply: one share price; no converting SAFEs or
                notes, option-pool changes, secondary sales, or new investment
                by this holder.
              </span>
            </label>
            <div className='flex flex-wrap items-center gap-2'>
              <Button type='button' variant='secondary' onClick={loadExample}>
                Load Synthetic Example
              </Button>
              <Button type='button' variant='tertiary' onClick={clear}>
                Clear Scenario
              </Button>
            </div>
            <p
              role='status'
              aria-atomic='true'
              className='min-h-20 text-sm text-secondary-token sm:min-h-12'
            >
              {status}
            </p>
            <dl
              className='grid gap-4 border-t border-subtle pt-4 sm:grid-cols-3'
              aria-label='Hypothetical Economic Ownership'
            >
              <OwnershipResult
                label='Before Round'
                ownership={result?.ownershipBeforePercent}
              />
              <OwnershipResult
                label='Committed Only'
                ownership={result?.committedOnly.ownershipPercent}
                amount={result?.committedOnly.newMoneyMinor}
              />
              <OwnershipResult
                label='Committed + Proposed'
                ownership={result?.committedAndProposed.ownershipPercent}
                amount={result?.committedAndProposed.newMoneyMinor}
              />
            </dl>
            <p className='text-xs text-secondary-token'>
              Economic ownership does not determine voting control. Board
              rights, share classes, protective provisions and preference
              economics are not evaluated. Percentages are rounded to two
              decimals. This is not a cap table or a financing commitment.
            </p>
          </div>
        </details>
      </ContentSurfaceCard>
    </section>
  );
}

function OwnershipResult({
  label,
  ownership,
  amount,
}: {
  readonly label: string;
  readonly ownership?: number;
  readonly amount?: number;
}) {
  return (
    <div className='min-w-0 space-y-1'>
      <dt className='text-xs text-secondary-token'>{label}</dt>
      <dd className='text-xl font-semibold tabular-nums text-primary-token'>
        {ownership === undefined ? '—' : `${PERCENT.format(ownership)}%`}
      </dd>
      <dd className='min-h-10 break-words text-xs tabular-nums text-secondary-token'>
        {amount === undefined ? ' ' : `${formatAmount(amount)} new cash`}
      </dd>
    </div>
  );
}

function ScenarioSelect({
  id,
  label,
  options,
  value,
  onValueChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
}) {
  return (
    <div className='grid min-w-0 gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className='min-h-5' />
    </div>
  );
}
