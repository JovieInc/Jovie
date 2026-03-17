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
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
      <ContentSurfaceCard className='overflow-hidden'>
        <div className='px-4 py-3'>
          <ContentSurfaceCard className='bg-surface-0 p-3.5'>
            <p className='text-[13px] text-secondary-token'>
              No connected accounts yet.
            </p>
          </ContentSurfaceCard>
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <div className='space-y-3 px-4 py-3'>
        {accounts.map(account => {
          const label = getProviderLabel(account.provider);
          const identifier = getProviderIdentifier(account);
          const isVerified = account.verification?.status === 'verified';

          return (
            <ContentSurfaceCard
              key={account.id}
              className='flex items-center justify-between gap-3 bg-surface-0 p-3.5'
            >
              <div className='flex min-w-0 items-center gap-3'>
                <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-1'>
                  <Link2 className='h-4 w-4 text-secondary-token' aria-hidden />
                </div>
                <div className='min-w-0'>
                  <p className='flex items-center gap-2 text-[13px] text-primary-token'>
                    {label}
                    {isVerified ? (
                      <span className='text-[11px] text-emerald-600'>
                        Verified
                      </span>
                    ) : null}
                  </p>
                  <p className='mt-0.5 truncate text-[11px] text-secondary-token'>
                    {identifier}
                  </p>
                </div>
              </div>

              <Button
                variant='destructive'
                size='sm'
                disabled={disconnectingId === account.id}
                onClick={() => setAccountToDisconnect(account)}
                className='shrink-0'
              >
                <Link2Off className='mr-1.5 h-4 w-4' aria-hidden />
                {disconnectingId === account.id
                  ? 'Disconnecting\u2026'
                  : 'Disconnect'}
              </Button>
            </ContentSurfaceCard>
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
    </ContentSurfaceCard>
  );
}
