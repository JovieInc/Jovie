'use client';

/**
 * ConnectedAccountsCard Component
 *
 * Displays OAuth providers (e.g. Google, Spotify) linked to the user's account.
 * Allows users to disconnect providers they no longer want connected.
 */

import { Button } from '@jovie/ui';
import { Link2, Link2Off } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { useNotifications } from '@/lib/hooks/useNotifications';

import { DashboardCard } from '../../atoms/DashboardCard';
import type { ClerkExternalAccountResource, ClerkUserResource } from './types';
import { extractErrorMessage } from './utils';

export interface ConnectedAccountsCardProps {
  readonly user: ClerkUserResource;
}

const PROVIDER_LABELS: Record<string, string> = {
  oauth_google: 'Google',
  oauth_spotify: 'Spotify',
  google: 'Google',
  spotify: 'Spotify',
  oauth_apple: 'Apple',
  apple: 'Apple',
  oauth_facebook: 'Facebook',
  facebook: 'Facebook',
  oauth_github: 'GitHub',
  github: 'GitHub',
  oauth_twitter: 'Twitter',
  twitter: 'Twitter',
};

function getProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider.replace(/^oauth_/, '');
}

function getProviderIdentifier(account: ClerkExternalAccountResource): string {
  if (account.emailAddress) return account.emailAddress;
  if (account.username) return account.username;
  const parts = [account.firstName, account.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Connected';
}

export function ConnectedAccountsCard({ user }: ConnectedAccountsCardProps) {
  const notifications = useNotifications();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [accountToDisconnect, setAccountToDisconnect] =
    useState<ClerkExternalAccountResource | null>(null);
  const [accounts, setAccounts] = useState<ClerkExternalAccountResource[]>(
    () => user.externalAccounts ?? []
  );

  // Sync accounts state when user.externalAccounts changes
  useEffect(() => {
    setAccounts(user.externalAccounts ?? []);
  }, [user.externalAccounts]);

  const handleDisconnect = async (account: ClerkExternalAccountResource) => {
    setDisconnectingId(account.id);
    try {
      await account.destroy();
      setAccounts(prev => prev.filter(a => a.id !== account.id));
      notifications.success(
        `${getProviderLabel(account.provider)} disconnected`
      );
    } catch (error) {
      const message = extractErrorMessage(error);
      notifications.error(message);
    } finally {
      setDisconnectingId(null);
    }
  };

  if (accounts.length === 0) {
    return null;
  }

  return (
    <DashboardCard variant='settings'>
      <div>
        <h3 className='text-[13px] sm:text-sm font-medium text-primary-token'>
          Connected accounts
        </h3>
        <p className='mt-0.5 sm:mt-1 text-xs sm:text-[13px] text-tertiary-token max-w-lg'>
          OAuth providers linked to your account. Disconnect a provider to
          revoke its access.
        </p>
      </div>

      <div className='mt-3 sm:mt-6 space-y-2 sm:space-y-3'>
        {accounts.map(account => {
          const label = getProviderLabel(account.provider);
          const identifier = getProviderIdentifier(account);
          const isVerified = account.verification?.status === 'verified';

          return (
            <div
              key={account.id}
              className='flex flex-col sm:flex-row sm:items-center justify-between rounded-lg sm:rounded-xl border border-subtle px-3 py-2.5 sm:px-4 sm:py-3 bg-surface-1 gap-2 sm:gap-3'
            >
              <div className='flex items-center gap-3'>
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10'>
                  <Link2 className='h-4 w-4 text-accent' />
                </div>
                <div>
                  <p className='text-sm font-medium text-primary flex items-center gap-2'>
                    {label}
                    {isVerified && (
                      <span className='inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600'>
                        Verified
                      </span>
                    )}
                  </p>
                  <p className='text-xs text-secondary mt-0.5'>{identifier}</p>
                </div>
              </div>

              <Button
                variant='ghost'
                size='sm'
                className='text-red-500 hover:text-red-600 hover:bg-red-50'
                disabled={disconnectingId === account.id}
                onClick={() => setAccountToDisconnect(account)}
              >
                <Link2Off className='h-4 w-4 mr-1.5' />
                {disconnectingId === account.id
                  ? 'Disconnecting\u2026'
                  : 'Disconnect'}
              </Button>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(accountToDisconnect)}
        onOpenChange={open => {
          if (!open) setAccountToDisconnect(null);
        }}
        title='Disconnect account?'
        description={`This will disconnect ${accountToDisconnect ? getProviderLabel(accountToDisconnect.provider) : 'this provider'} from your account. You can reconnect it later.`}
        confirmLabel='Disconnect'
        variant='destructive'
        onConfirm={async () => {
          if (accountToDisconnect) await handleDisconnect(accountToDisconnect);
        }}
      />
    </DashboardCard>
  );
}
