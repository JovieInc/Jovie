'use client';

/**
 * ProfileSidebarHeader
 *
 * Provides title and action buttons for the profile sidebar header.
 * Designed for use with EntitySidebarShell's `title` and `headerActions` props.
 */

import { Check, Contact, Copy, ExternalLink, QrCode } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { getQrCodeUrl } from '@/components/molecules/QRCode';
import { BASE_URL } from '@/constants/domains';

interface UseProfileHeaderResult {
  title: ReactNode;
  actions: ReactNode;
}

interface UseProfileHeaderPartsProps {
  readonly username: string;
  readonly displayName: string;
  readonly profilePath: string;
  readonly onClose?: () => void;
}

function generateVCard(
  displayName: string,
  username: string,
  profileUrl: string
): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${displayName || username}`,
    `URL:${profileUrl}`,
    `NOTE:Jovie profile: @${username}`,
    'END:VCARD',
  ].join('\r\n');
}

/**
 * Hook that returns the title and actions for the profile sidebar header.
 * Designed for use with EntitySidebarShell's `title` and `headerActions` props.
 */
export function useProfileHeaderParts({
  username,
  displayName,
  profilePath,
  onClose,
}: UseProfileHeaderPartsProps): UseProfileHeaderResult {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const profileUrl = `${BASE_URL}${profilePath}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setIsCopied(true);
      toast.success('Profile URL copied');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleOpenProfile = () => {
    globalThis.open(profileUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadVCard = () => {
    const blob = new Blob([generateVCard(displayName, username, profileUrl)], {
      type: 'text/vcard',
    });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${username}.vcf`;
    link.click();
    URL.revokeObjectURL(blobUrl);
    toast.success('vCard downloaded');
  };

  const handleDownloadQRCode = () => {
    const link = document.createElement('a');
    link.href = getQrCodeUrl(profileUrl, 420);
    link.download = `${username}-qr.png`;
    link.click();
    toast.success('QR code downloaded');
  };

  const primaryActions: DrawerHeaderAction[] = [
    {
      id: 'copy',
      label: isCopied ? 'Copied!' : 'Copy profile link',
      icon: Copy,
      activeIcon: Check,
      isActive: isCopied,
      onClick: () => void handleCopyUrl(),
    },
  ];

  const overflowActions: DrawerHeaderAction[] = [
    {
      id: 'open',
      label: 'Open profile',
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
      label: 'Download QR code',
      icon: QrCode,
      onClick: handleDownloadQRCode,
    },
  ];

  const title: ReactNode = 'Profile';

  const actions = (
    <DrawerHeaderActions
      primaryActions={primaryActions}
      overflowActions={overflowActions}
      onClose={onClose}
    />
  );

  return { title, actions };
}
