'use client';

/**
 * ConnectedAccountsCard Component
 *
 * Displays OAuth providers (e.g. Google, Spotify) linked to the user's account.
 * Allows users to disconnect providers they no longer want connected.
 */

import { Badge, Button } from '@jovie/ui';
import { CheckCircle, Link2, Link2Off } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { useNotifications } from '@/lib/hooks/useNotifications';

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
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <div className='px-4 py-3 sm:px-5'>
          <p className='text-app text-secondary-token'>
            No connected accounts yet.
          </p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <>
      <DashboardCard
        variant='settings'
        padding='none'
        className='divide-y divide-subtle/60 overflow-hidden'
      >
        {accounts.map(account => {
          const label = getProviderLabel(account.provider);
          const identifier = getProviderIdentifier(account);
          const isVerified = account.verification?.status === 'verified';

          return (
            <div
              key={account.id}
              className='flex items-start justify-between gap-3 px-4 py-3 sm:px-5'
            >
              <div className='flex min-w-0 items-center gap-3'>
                <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--linear-app-frame-seam) bg-surface-0'>
                  <Link2 className='h-4 w-4 text-secondary-token' aria-hidden />
                </div>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <p className='text-app font-caption text-primary-token'>
                      {label}
                    </p>
                    {isVerified ? (
                      <Badge variant='success' size='sm' className='gap-1'>
                        <CheckCircle className='h-3.5 w-3.5' aria-hidden />
                        Verified
                      </Badge>
                    ) : null}
                  </div>
                  <p className='mt-0.5 truncate text-2xs text-secondary-token'>
                    {identifier}
                  </p>
                </div>
              </div>

              <Button
                variant='ghost'
                size='sm'
                disabled={disconnectingId === account.id}
                onClick={() => setAccountToDisconnect(account)}
                className='h-7 shrink-0 rounded-lg border border-transparent bg-transparent px-2.5 text-2xs font-caption text-secondary-token hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive'
              >
                <Link2Off className='mr-1.5 h-4 w-4' aria-hidden />
                {disconnectingId === account.id
                  ? 'Disconnecting\u2026'
                  : 'Disconnect'}
              </Button>
            </div>
          );
        })}
      </DashboardCard>

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
    </>
  );
}
