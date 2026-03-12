'use client';

/**
 * ReleaseDspLinks Component
 *
 * DSP links section with add/remove functionality and ISRC rescan
 */

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SimpleTooltip,
} from '@jovie/ui';
import { Loader2, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import {
  DRAWER_LINK_SECTION_ICON_BUTTON_CLASSNAME,
  DRAWER_SECTION_HEADING_CLASSNAME,
  DrawerButton,
  DrawerLinkSection,
  DrawerSurfaceCard,
  SidebarLinkRow,
} from '@/components/molecules/drawer';
import type { ProviderKey } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

import type { Release } from './types';
import { isValidUrl } from './utils';

/** Cooldown duration in ms (matches server-side 5 min window) */
const RESCAN_COOLDOWN_MS = 5 * 60 * 1000;

interface ReleaseDspLinksProps {
  readonly release: Release;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
  readonly isEditable: boolean;
  readonly isAddingLink: boolean;
  readonly newLinkUrl: string;
  readonly selectedProvider: ProviderKey | null;
  readonly isAddingDspLink: boolean;
  readonly isRemovingDspLink: string | null;
  readonly onSetIsAddingLink: (value: boolean) => void;
  readonly onSetNewLinkUrl: (value: string) => void;
  readonly onSetSelectedProvider: (value: ProviderKey | null) => void;
  readonly onAddLink: () => Promise<void>;
  readonly onRemoveLink: (provider: ProviderKey) => Promise<void>;
  readonly onNewLinkKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void;
  readonly onRescanIsrc?: () => void;
  readonly isRescanningIsrc?: boolean;
}

const FORM_ROW_CLASS =
  'grid grid-cols-[88px,minmax(0,1fr)] items-center gap-2.5';

/**
 * Format remaining cooldown time for display.
 */
function formatCooldown(remainingMs: number): string {
  if (remainingMs <= 0) return '';
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}

export function ReleaseDspLinks({
  release,
  providerConfig,
  isEditable,
  isAddingLink,
  newLinkUrl,
  selectedProvider,
  isAddingDspLink,
  isRemovingDspLink,
  onSetIsAddingLink,
  onSetNewLinkUrl,
  onSetSelectedProvider,
  onAddLink,
  onRemoveLink,
  onNewLinkKeyDown,
  onRescanIsrc,
  isRescanningIsrc = false,
}: ReleaseDspLinksProps) {
  // Track local cooldown state per release
  const [cooldownEnd, setCooldownEnd] = useState<number>(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  // Reset cooldown when release changes
  useEffect(() => {
    setCooldownEnd(0);
    setRemainingMs(0);
  }, [release.id]);

  // Start cooldown timer after a successful (non-rate-limited) rescan
  const wasRescanningRef = useRef(false);
  useEffect(() => {
    if (isRescanningIsrc) {
      wasRescanningRef.current = true;
    } else if (wasRescanningRef.current) {
      wasRescanningRef.current = false;
      // Rescan just finished - start cooldown
      const end = Date.now() + RESCAN_COOLDOWN_MS;
      setCooldownEnd(end);
      setRemainingMs(RESCAN_COOLDOWN_MS);
    }
  }, [isRescanningIsrc]);

  // Countdown timer
  useEffect(() => {
    if (cooldownEnd <= 0) return;

    const tick = () => {
      const remaining = cooldownEnd - Date.now();
      if (remaining <= 0) {
        setRemainingMs(0);
        setCooldownEnd(0);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setRemainingMs(remaining);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldownEnd]);

  const isCoolingDown = remainingMs > 0;
  const isRescanDisabled = isRescanningIsrc || isCoolingDown;

  const handleRescan = useCallback(() => {
    if (isRescanDisabled || !onRescanIsrc) return;
    onRescanIsrc();
  }, [isRescanDisabled, onRescanIsrc]);

  // Get list of providers that don't have links yet (for the add dropdown)
  const providerKeys = Object.keys(providerConfig) as ProviderKey[];
  const availableProviders = providerKeys
    .filter(key => !release.providers.some(p => p.key === key))
    .map(key => [key, providerConfig[key]] as const);

  let rescanTooltip = 'Scan ISRC for links';
  if (isRescanningIsrc) {
    rescanTooltip = 'Scanning...';
  } else if (isCoolingDown) {
    rescanTooltip = `Try again in ${formatCooldown(remainingMs)}`;
  }

  const rescanButton =
    isEditable && onRescanIsrc ? (
      <SimpleTooltip content={rescanTooltip} side='bottom'>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          aria-label={rescanTooltip}
          onClick={handleRescan}
          disabled={isRescanDisabled}
          className={DRAWER_LINK_SECTION_ICON_BUTTON_CLASSNAME}
        >
          {isRescanningIsrc ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <RefreshCw className='h-4 w-4' />
          )}
        </Button>
      </SimpleTooltip>
    ) : null;

  return (
    <DrawerLinkSection
      title='Links'
      onAdd={
        isEditable && availableProviders.length > 0
          ? () => onSetIsAddingLink(true)
          : undefined
      }
      addLabel='Add platform link'
      headerActions={rescanButton}
      isEmpty={release.providers.length === 0 && !isAddingLink}
      emptyMessage='No platform links yet.'
    >
      {/* Providers list */}
      {release.providers.length > 0 && (
        <div className='space-y-0.5'>
          {release.providers.map(provider => {
            const config = providerConfig[provider.key];
            const isManual = provider.source === 'manual';

            return (
              <SidebarLinkRow
                key={provider.key}
                icon={
                  <ProviderIcon
                    provider={provider.key}
                    className='h-4 w-4'
                    aria-label={config?.label || provider.key}
                  />
                }
                label={config?.label || provider.key}
                url={provider.url}
                deepLinkPlatform={provider.key}
                badge={isManual ? 'Custom' : undefined}
                isEditable={isEditable}
                isRemoving={isRemovingDspLink === provider.key}
                onRemove={() => void onRemoveLink(provider.key)}
              />
            );
          })}
        </div>
      )}

      {/* Add link form */}
      {isEditable && isAddingLink && (
        <DrawerSurfaceCard className='mt-2 space-y-2.5 rounded-[10px] p-3'>
          <div className={FORM_ROW_CLASS}>
            <Label
              className={cn(
                DRAWER_SECTION_HEADING_CLASSNAME,
                'text-[11px] tracking-[0.08em]'
              )}
            >
              Provider
            </Label>
            <Select
              value={selectedProvider ?? ''}
              onValueChange={(value: string) => {
                if (value in providerConfig) {
                  onSetSelectedProvider(value as ProviderKey);
                }
              }}
            >
              <SelectTrigger className='h-8 w-full rounded-[8px] border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-[12px]'>
                <SelectValue placeholder='Select provider' />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map(([key, config]) => {
                  return (
                    <SelectItem key={key} value={key}>
                      <div className='flex items-center gap-2'>
                        <ProviderIcon provider={key} className='h-4 w-4' />
                        {config.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className={FORM_ROW_CLASS}>
            <Label
              className={cn(
                DRAWER_SECTION_HEADING_CLASSNAME,
                'text-[11px] tracking-[0.08em]'
              )}
            >
              URL
            </Label>
            <Input
              type='url'
              value={newLinkUrl}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onSetNewLinkUrl(event.target.value)
              }
              onKeyDown={onNewLinkKeyDown}
              placeholder='https://open.spotify.com/...'
              inputMode='url'
              autoCapitalize='none'
              autoCorrect='off'
              autoFocus
              className='h-8 rounded-[8px] border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-[12px]'
            />
          </div>
          <div className='flex justify-end gap-2 pt-1'>
            <DrawerButton
              type='button'
              onClick={() => {
                onSetIsAddingLink(false);
                onSetNewLinkUrl('');
                onSetSelectedProvider(null);
              }}
              tone='ghost'
            >
              Cancel
            </DrawerButton>
            <DrawerButton
              type='button'
              onClick={() => void onAddLink()}
              disabled={
                !isValidUrl(newLinkUrl) || !selectedProvider || isAddingDspLink
              }
              className='min-w-[68px]'
            >
              {isAddingDspLink ? 'Adding...' : 'Add'}
            </DrawerButton>
          </div>
        </DrawerSurfaceCard>
      )}
    </DrawerLinkSection>
  );
}
