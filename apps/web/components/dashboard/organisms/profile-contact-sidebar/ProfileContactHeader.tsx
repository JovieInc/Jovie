'use client';

import { Check, Contact, Copy, ExternalLink, QrCode } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Generate a vCard string for download
 */
function generateVCard(
  displayName: string,
  username: string,
  profileUrl: string
): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${displayName || username}`,
    `URL:${profileUrl}`,
    `NOTE:Jovie profile: @${username}`,
    'END:VCARD',
  ];
  return lines.join('\r\n');
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const profileUrl = useMemo(() => {
    if (typeof window === 'undefined') return profilePath;
    return `${window.location.origin}${profilePath}`;
  }, [profilePath]);

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setIsCopied(true);
      toast.success('Profile URL copied');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setIsCopied(false);
        timeoutRef.current = null;
      }, 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [profileUrl]);

  const handleOpenProfile = useCallback(() => {
    window.open(profilePath, '_blank', 'noopener,noreferrer');
  }, [profilePath]);

  const handleDownloadVCard = useCallback(() => {
    const vCardContent = generateVCard(displayName, username, profileUrl);
    const blob = new Blob([vCardContent], { type: 'text/vcard' });
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${username}.vcf`;
    link.click();

    URL.revokeObjectURL(blobUrl);
    toast.success('vCard downloaded');
  }, [displayName, username, profileUrl]);

  const handleDownloadQRCode = useCallback(() => {
    const link = document.createElement('a');
    link.href = getQrCodeUrl(profileUrl, 420);
    link.download = `${username}-qr.png`;
    link.click();
    toast.success('QR code downloaded');
  }, [profileUrl, username]);

  // Primary actions: Copy URL (with check animation)
  const primaryActions: DrawerHeaderAction[] = useMemo(
    () => [
      {
        id: 'copy',
        label: isCopied ? 'Copied!' : 'Copy profile link',
        icon: Copy,
        activeIcon: Check,
        isActive: isCopied,
        onClick: handleCopyUrl,
      },
    ],
    [isCopied, handleCopyUrl]
  );

  // Overflow actions: Open, vCard, QR Code
  const overflowActions: DrawerHeaderAction[] = useMemo(
    () => [
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
    ],
    [handleOpenProfile, handleDownloadVCard, handleDownloadQRCode]
  );

  return (
    <div className='space-y-3'>
      {/* Avatar, Name, and Actions Row */}
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
