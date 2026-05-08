import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  FEATURE_FLAGS,
  type FeatureFlag,
  isEnabled,
} from '@/lib/feature-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description: 'Environment-driven feature flags and current state.',
};

interface FlagRow {
  readonly name: FeatureFlag;
  readonly enabled: boolean;
  readonly defaultValue: boolean;
}

export default async function FeatureFlagsPage() {
  const entitlements = await getCurrentUserEntitlements();
  if (
    !entitlements.isAuthenticated ||
    !entitlements.userId ||
    !entitlements.isAdmin
  ) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  const flags: readonly FlagRow[] = (
    Object.keys(FEATURE_FLAGS) as FeatureFlag[]
  ).map(name => ({
    name,
    enabled: isEnabled(name),
    defaultValue: FEATURE_FLAGS[name],
  }));

  return (
    <div className='mx-auto w-full max-w-3xl px-6 py-10'>
      <header className='mb-8'>
        <h1 className='text-xl font-semibold text-primary-token'>
          Feature Flags
        </h1>
        <p className='mt-1 text-sm text-secondary-token'>
          Environment-driven flags. New features ship OFF by default. Override
          via{' '}
          <code className='rounded bg-surface-1 px-1.5 py-0.5 text-[12px]'>
            FEATURE_&lt;NAME&gt;
          </code>
          .
        </p>
      </header>

      <div className='overflow-hidden rounded-md border border-subtle bg-surface-1'>
        <table className='w-full text-sm'>
          <thead className='bg-surface-0 text-tertiary-token'>
            <tr>
              <th className='px-4 py-2 text-left font-medium'>Flag</th>
              <th className='px-4 py-2 text-left font-medium'>State</th>
              <th className='px-4 py-2 text-left font-medium'>Default</th>
            </tr>
          </thead>
          <tbody>
            {flags.map(flag => (
              <tr key={flag.name} className='border-t border-subtle align-top'>
                <td className='px-4 py-3'>
                  <div className='font-medium text-primary-token'>
                    {flag.name}
                  </div>
                </td>
                <td className='px-4 py-3'>
                  <span
                    className={
                      flag.enabled
                        ? 'inline-flex items-center rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11.5px] font-medium text-cyan-300'
                        : 'inline-flex items-center rounded-full bg-surface-0 px-2 py-0.5 text-[11.5px] font-medium text-tertiary-token'
                    }
                  >
                    {flag.enabled ? 'On' : 'Off'}
                  </span>
                </td>
                <td className='px-4 py-3 text-tertiary-token'>
                  {flag.defaultValue ? 'On' : 'Off'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
