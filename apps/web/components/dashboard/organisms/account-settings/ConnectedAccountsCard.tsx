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
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
      {accounts.map(account => {
        const label = getProviderLabel(account.provider);
        const identifier = getProviderIdentifier(account);
        const isVerified = account.verification?.status === 'verified';

        return (
          <div
            key={account.id}
            className='flex items-center justify-between px-5 py-4'
          >
            <div className='flex items-center gap-3'>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10'>
                <Link2 className='h-4 w-4 text-accent' />
              </div>
              <div>
                <p className='text-sm text-primary-token flex items-center gap-2'>
                  {label}
                  {isVerified && (
                    <span className='text-xs text-emerald-600'>Verified</span>
                  )}
                </p>
                <p className='text-xs text-secondary-token mt-0.5'>
                  {identifier}
                </p>
              </div>
            </div>

            <Button
              variant='ghost'
              size='sm'
              className='text-destructive hover:text-destructive hover:bg-destructive/10'
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
