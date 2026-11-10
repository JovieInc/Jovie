'use client';

import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { LISTEN_COOKIE } from '@/constants/app';
import type { ProviderKey } from '@/lib/discography/types';
import { appendUTMParamsToUrl, type PartialUTMParams } from '@/lib/utm';
import { ActionDial, type ActionDialOption } from './ActionDial';

export interface MusicServiceDialProvider {
  readonly key: ProviderKey;
  readonly label: string;
  readonly url: string;
}

interface MusicServiceDialProps {
  /** Providers in display order. The caller owns ordering; the dial never reorders. */
  readonly providers: readonly MusicServiceDialProvider[];
  /**
   * Provider to start on when the fan has no saved preference (the routing
   * layer's first pick). A saved cookie preference always wins over it.
   */
  readonly initialKey?: ProviderKey;
  readonly utmParams: PartialUTMParams;
  readonly onStream: (key: ProviderKey) => void;
}

function readPreferredProvider(): string | null {
  const entry = document.cookie
    .split(';')
    .find(cookie => cookie.trim().startsWith(`${LISTEN_COOKIE}=`));
  if (!entry) return null;
  const value = entry.slice(entry.indexOf('=') + 1).trim();
  return value || null;
}

function rememberProvider(key: ProviderKey): void {
  document.cookie = `${LISTEN_COOKIE}=${key}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  try {
    globalThis.localStorage.setItem(LISTEN_COOKIE, key);
  } catch {
    // Cookie preference still works when storage is unavailable.
  }
}

export function MusicServiceDial({
  providers,
  initialKey,
  utmParams,
  onStream,
}: Readonly<MusicServiceDialProps>) {
  const fallbackKey =
    providers.find(provider => provider.key === initialKey)?.key ??
    providers[0]?.key ??
    null;
  const [selectedKey, setSelectedKey] = useState<ProviderKey | null>(
    fallbackKey
  );

  useLayoutEffect(() => {
    const preferred = readPreferredProvider();
    const available = providers.find(provider => provider.key === preferred);
    setSelectedKey(available?.key ?? fallbackKey);
  }, [providers, fallbackKey]);

  const options = useMemo<ActionDialOption[]>(
    () =>
      providers.map(provider => {
        const logo = DSP_LOGO_CONFIG[provider.key];
        return {
          id: provider.key,
          label: logo?.name ?? provider.label,
          href: appendUTMParamsToUrl(provider.url, utmParams),
          icon: logo?.iconPath ? (
            <svg
              viewBox='0 0 24 24'
              fill='currentColor'
              className='h-5 w-5 shrink-0'
              style={{ color: logo.color }}
              aria-hidden='true'
            >
              <path d={logo.iconPath} />
            </svg>
          ) : undefined,
        };
      }),
    [providers, utmParams]
  );

  const handleSelect = useCallback(
    (key: string) => {
      const provider = providers.find(candidate => candidate.key === key);
      if (!provider) return;
      setSelectedKey(provider.key);
      rememberProvider(provider.key);
    },
    [providers]
  );

  const handleStream = useCallback(
    (key: string) => {
      const provider = providers.find(candidate => candidate.key === key);
      if (!provider) return;
      rememberProvider(provider.key);
      onStream(provider.key);
    },
    [onStream, providers]
  );

  if (!selectedKey || options.length === 0) return null;

  return (
    <ActionDial
      options={options}
      selectedId={selectedKey}
      onSelect={handleSelect}
      onActivate={handleStream}
      actionLabel='Stream Now'
      groupLabel='Choose a streaming service'
      hint='Swipe to switch. Always remembered.'
    />
  );
}
