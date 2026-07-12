'use client';

import { Contact, ExternalLink, QrCode, Wallet } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from '@/components/feedback';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { getQrCodeUrl } from '@/components/molecules/QRCode';
import { BASE_URL } from '@/constants/domains';
import { getProfileModePath } from '@/features/profile/registry';
import { useAppFlag } from '@/lib/flags/client';
import { downloadBlob } from '@/lib/utils/download';
import {
  isAppleWalletPassSupportedClient,
  openAppleWalletProfilePass,
} from '@/lib/wallet/apple/client';

interface UseProfileHeaderResult {
  readonly title: ReactNode;
  readonly actions: ReactNode;
  readonly primaryActions: DrawerHeaderAction[];
  readonly overflowActions: DrawerHeaderAction[];
}

interface UseProfileHeaderPartsProps {
  readonly username: string;
  readonly displayName: string;
  readonly profilePath: string;
  readonly onClose?: () => void;
}

function escapeVCardText(value: string): string {
  return value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll(/\r\n|\r|\n/g, String.raw`\n`)
    .replaceAll(';', String.raw`\;`)
    .replaceAll(',', String.raw`\,`);
}

function generateVCard(
  displayName: string,
  username: string,
  profileUrl: string
): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCardText(displayName || username)}`,
    `URL:${profileUrl}`,
    `NOTE:${escapeVCardText('Jovie profile: @' + username)}`,
    'END:VCARD',
  ].join('\r\n');
}

export function useProfileHeaderParts({
  username,
  displayName,
  profilePath,
  onClose,
}: Readonly<UseProfileHeaderPartsProps>): UseProfileHeaderResult {
  const appleWalletEnabled = useAppFlag('APPLE_WALLET_PROFILE_PASS');
  const [supportsAppleWallet, setSupportsAppleWallet] = useState(false);
  const resolvedProfilePath =
    profilePath.trim().length > 0
      ? profilePath
      : getProfileModePath(username, 'profile');
  const profileUrl = `${BASE_URL}${resolvedProfilePath}`;

  useEffect(() => {
    setSupportsAppleWallet(isAppleWalletPassSupportedClient());
  }, []);

  const handleOpenProfile = () => {
    globalThis.open(profileUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadVCard = () => {
    const blob = new Blob([generateVCard(displayName, username, profileUrl)], {
      type: 'text/vcard',
    });
    downloadBlob(blob, `${username}.vcf`);
    toast.success('vCard downloaded');
  };

  const handleDownloadQRCode = async () => {
    try {
      const qrUrl = getQrCodeUrl(profileUrl, 420);
      const response = await fetch(qrUrl);

      if (!response.ok) {
        throw new Error('Failed to fetch QR code image');
      }

      const qrBlob = await response.blob();
      downloadBlob(qrBlob, `${username}-qr.png`);
      toast.success('QR code downloaded');
    } catch {
      toast.error('Unable to download QR code');
    }
  };

  const primaryActions: DrawerHeaderAction[] = [];

  const overflowActions: DrawerHeaderAction[] = [
    {
      id: 'open',
      label: 'Open Profile',
      icon: ExternalLink,
      onClick: handleOpenProfile,
    },
    {
      id: 'vcard',
      label: 'Download vCard',
      icon: Contact,
      onClick: handleDownloadVCard,
    },
    {
      id: 'qr',
      label: 'Download QR Code',
      icon: QrCode,
      onClick: () => {
        void handleDownloadQRCode();
      },
    },
  ];

  if (appleWalletEnabled && supportsAppleWallet) {
    overflowActions.push({
      id: 'apple-wallet-profile-pass',
      label: 'Add To Apple Wallet',
      icon: Wallet,
      onClick: openAppleWalletProfilePass,
    });
  }

  let primaryLabel = 'Profile';
  if (displayName && displayName !== username) {
    primaryLabel = displayName;
  } else if (username) {
    primaryLabel = `@${username}`;
  }

  const secondaryLabel =
    username && displayName && displayName !== username ? `@${username}` : null;

  const title: ReactNode = (
    <div className='flex min-w-0 items-center gap-1.5'>
      <span className='truncate text-xs font-semibold tracking-tight text-primary-token'>
        {primaryLabel}
      </span>
      {secondaryLabel ? (
        <span className='truncate text-2xs text-secondary-token'>
          {secondaryLabel}
        </span>
      ) : null}
    </div>
  );

  const actions = (
    <DrawerHeaderActions
      primaryActions={primaryActions}
      overflowActions={overflowActions}
      onClose={onClose}
    />
  );

  return { title, actions, primaryActions, overflowActions };
}
