'use client';

import { Check, Contact, Copy, ExternalLink, QrCode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/atoms/Avatar/Avatar';
import { getQrCodeUrl } from '@/components/atoms/QRCode';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';

export interface ProfileContactHeaderProps {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  profilePath: string;
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

export function ProfileContactHeader({
  displayName,
  username,
  avatarUrl,
  profilePath,
}: ProfileContactHeaderProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Compute URL once per render (no hook needed)
  const profileUrl =
    typeof window === 'undefined'
      ? profilePath
      : `${window.location.origin}${profilePath}`;

  // Action handlers - defined inline, no useCallback needed
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
    window.open(profilePath, '_blank', 'noopener,noreferrer');
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

  // Action arrays - computed inline, no useMemo needed
  const primaryActions: DrawerHeaderAction[] = [
    {
      id: 'copy',
      label: isCopied ? 'Copied!' : 'Copy profile link',
      icon: Copy,
      activeIcon: Check,
      isActive: isCopied,
      onClick: handleCopyUrl,
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

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-3'>
        <Avatar
          src={avatarUrl}
          alt={displayName ? `${displayName} avatar` : 'Profile avatar'}
          name={displayName}
          size='lg'
        />
        <div className='min-w-0 flex-1'>
          <div className='truncate text-sm font-semibold text-primary-token'>
            {displayName || 'Unnamed'}
          </div>
          <div className='truncate text-xs text-secondary-token'>
            @{username}
          </div>
        </div>
        <DrawerHeaderActions
          primaryActions={primaryActions}
          overflowActions={overflowActions}
        />
      </div>
    </div>
  );
}
