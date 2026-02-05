'use client';

/**
 * ProfileSidebarHeader Component
 *
 * Header section of the profile sidebar with action buttons
 */

import { Check, Contact, Copy, ExternalLink, QrCode, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getQrCodeUrl } from '@/components/molecules/QRCode';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { BASE_URL } from '@/constants/domains';

interface ProfileSidebarHeaderProps {
  readonly username: string;
  readonly displayName: string;
  readonly profilePath: string;
  readonly onClose: () => void;
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

export function ProfileSidebarHeader({
  username,
  displayName,
  profilePath,
  onClose,
}: ProfileSidebarHeaderProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Use BASE_URL to ensure profile links always point to the profile domain
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

  // Primary actions: Close + Copy (matching ReleaseSidebarHeader pattern)
  const primaryActions: DrawerHeaderAction[] = [
    {
      id: 'close',
      label: 'Close profile sidebar',
      icon: X,
      onClick: onClose,
    },
    {
      id: 'copy',
      label: isCopied ? 'Copied!' : 'Copy profile link',
      icon: Copy,
      activeIcon: Check,
      isActive: isCopied,
      onClick: () => void handleCopyUrl(),
    },
  ];

  // Overflow actions: Open, vCard, QR code
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

  return (
    <div className='flex items-center justify-between px-3 py-2'>
      <p className='text-xs font-medium text-sidebar-foreground truncate'>
        Profile details
      </p>
      <DrawerHeaderActions
        primaryActions={primaryActions}
        overflowActions={overflowActions}
      />
    </div>
  );
}
