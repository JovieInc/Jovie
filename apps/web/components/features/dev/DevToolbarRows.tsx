'use client';

import { Button } from '@jovie/ui';
import * as Switch from '@radix-ui/react-switch';
import {
  type QueryClient,
  useQueryClient as useQueryClientBase,
} from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import { useBillingStatusQuery } from '@/lib/queries/useBillingStatusQuery';

/** Safe query client — returns null outside QueryClientProvider (root layout). */
function useSafeQueryClient(): QueryClient | null {
  try {
    return useQueryClientBase();
  } catch {
    return null;
  }
}

export function PlanToggle() {
  const queryClient = useSafeQueryClient();
  if (!queryClient) return null;
  return <PlanToggleInner queryClient={queryClient} />;
}

/** Plan toggle for admin users. Uses billing query to show/switch plans. */
function PlanToggleInner({
  queryClient,
}: {
  readonly queryClient: QueryClient;
}) {
  const { data: billing } = useBillingStatusQuery();
  const [switching, setSwitching] = useState(false);
  const currentPlan = billing?.plan ?? 'free';

  return (
    <>
      <div className='w-px h-4 mx-1 bg-subtle' />
      <div className='flex items-center gap-0.5'>
        <span className='text-3xs text-quaternary-token mr-0.5'>Plan</span>
        {(['free', 'pro', 'max'] as const).map(plan => (
          <Button
            key={plan}
            type='button'
            variant='ghost'
            size='sm'
            disabled={switching}
            onClick={async () => {
              if (plan === currentPlan || switching) return;
              setSwitching(true);
              try {
                const res = await fetch('/api/admin/set-plan', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ plan }),
                });
                if (res.ok) {
                  await queryClient.invalidateQueries({
                    queryKey: queryKeys.billing.all,
                  });
                }
              } finally {
                setSwitching(false);
              }
            }}
            className={`h-auto px-1.5 py-0.5 rounded text-3xs transition-colors ${
              plan === currentPlan
                ? 'font-semibold text-accent bg-accent/10'
                : 'text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2'
            } ${switching ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            title={`Switch to ${plan} plan`}
            aria-label={`Switch to ${plan} plan`}
          >
            {plan}
          </Button>
        ))}
      </div>
    </>
  );
}

export function OrphanOverrides({
  keys,
  onPurge,
}: Readonly<{ keys: string[]; onPurge: () => void }>) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className='mb-2 mt-1 border-l-2 border-yellow-500/50 pl-3'>
      <div className='flex items-center justify-between mb-1'>
        <span
          className='text-3xs font-semibold uppercase tracking-wide text-yellow-400'
          title='Override keys in localStorage that no longer match any flag in APP_FLAG_OVERRIDE_KEYS. Likely from renamed or removed flags.'
        >
          Orphans ({keys.length})
        </span>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='link'
            onClick={() => setExpanded(prev => !prev)}
            className='h-auto text-3xs text-(--color-text-tertiary) hover:text-(--color-text-primary) underline transition-colors'
          >
            {expanded ? 'Hide' : 'Inspect'}
          </Button>
          <Button
            type='button'
            variant='link'
            onClick={onPurge}
            className='h-auto text-3xs text-yellow-400 hover:text-yellow-300 underline transition-colors'
          >
            Purge
          </Button>
        </div>
      </div>
      {expanded && (
        <div className='flex flex-col gap-0.5 pb-1'>
          {keys.map(k => (
            <span
              key={k}
              className='truncate text-3xs text-quaternary-token font-mono'
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function FlagRow({
  label,
  isOverridden,
  checked,
  flashing = false,
  serverDefault,
  onCheckedChange,
  onClear,
  source = 'statsig',
}: Readonly<{
  label: string;
  isOverridden: boolean;
  checked: boolean;
  /** Parent-driven flash highlight — survives row re-categorization. */
  flashing?: boolean;
  serverDefault?: boolean;
  onCheckedChange: (v: boolean) => void;
  onClear: () => void;
  source?: 'statsig' | 'code';
}>) {
  return (
    <div
      className={`flex items-center gap-2 py-0.5 rounded-sm transition-colors duration-subtle ${
        flashing ? 'bg-accent/10' : ''
      }`}
    >
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={`relative w-7 h-4 rounded-full transition-colors outline-none cursor-pointer shrink-0 ${
          checked ? 'bg-accent' : 'bg-surface-3'
        }`}
      >
        <Switch.Thumb className='block w-3 h-3 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-3.5 shadow-sm dark:bg-white' />
      </Switch.Root>
      <span
        className={`flex-1 truncate ${isOverridden ? 'text-(--color-text-primary)' : 'text-(--color-text-tertiary)'}`}
      >
        {label}
      </span>
      {isOverridden && serverDefault !== undefined && (
        <span className='shrink-0 text-3xs text-quaternary-token'>
          server: {serverDefault ? 'on' : 'off'}
        </span>
      )}
      {isOverridden && (
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={onClear}
          title='Remove override'
          className='h-auto w-auto shrink-0 p-0 text-quaternary-token hover:bg-transparent hover:text-(--color-text-secondary) transition-colors'
        >
          <X size={10} />
        </Button>
      )}
      {!isOverridden && (
        <span className='shrink-0 text-3xs text-quaternary-token'>
          {source}
        </span>
      )}
    </div>
  );
}
