/**
 * Anti-Cloaking Safe Social Link Component
 * Wraps external links with crawler-safe labels and proper security headers
 */

'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { useWrapLinkMutation } from '@/lib/queries/useWrapLinkMutation';
import { getCrawlerSafeLabel } from '@/lib/utils/domain-categorizer';
import { extractDomain } from '@/lib/utils/url-parsing';

interface WrappedSocialLinkProps {
  href: string;
  platform: string;
  children?: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  'aria-label'?: string;
}

interface WrappedLinkData {
  wrappedUrl: string;
  kind: 'normal' | 'sensitive';
  alias: string;
}

export function WrappedSocialLink({
  href,
  platform,
  children,
  className = '',
  target = '_blank',
  rel,
  'aria-label': ariaLabel,
}: WrappedSocialLinkProps) {
  const [wrappedData, setWrappedData] = useState<WrappedLinkData | null>(null);

  // Generate crawler-safe label
  const domain = extractDomain(href);
  const crawlerSafeLabel = getCrawlerSafeLabel(domain, platform);

  const { mutate: wrapLink, isPending: isLoading } = useWrapLinkMutation();

  // Check if this is an external link that needs wrapping
  const needsWrapping = useMemo(() => {
    if (!href || href.startsWith('/')) return false;
    if (
      typeof window !== 'undefined' &&
      href.includes(window.location.hostname)
    )
      return false;
    return true;
  }, [href]);

  useEffect(() => {
    // Reset state for new href/platform
    setWrappedData(null);

    // Skip wrapping for internal links
    if (!needsWrapping) {
      setWrappedData({
        wrappedUrl: href,
        kind: 'normal',
        alias: crawlerSafeLabel,
      });
      return;
    }

    // Wrap external link using TanStack Query mutation
    wrapLink(
      { url: href, platform },
      {
        onSuccess: data => {
          setWrappedData({
            wrappedUrl:
              data.kind === 'sensitive'
                ? `/out/${data.shortId}`
                : `/go/${data.shortId}`,
            kind: data.kind,
            alias: data.titleAlias || crawlerSafeLabel,
          });
        },
        onError: () => {
          // Fallback to original URL on error
          setWrappedData({
            wrappedUrl: href,
            kind: 'normal',
            alias: crawlerSafeLabel,
          });
        },
      }
    );
  }, [href, platform, crawlerSafeLabel, needsWrapping, wrapLink]);

  // Default security attributes
  const securityRel = rel || 'noreferrer noopener ugc nofollow';

  // Show loading state or fallback
  if (isLoading || !wrappedData) {
    return (
      <Link
        href={href}
        target={target}
        rel={securityRel}
        className={className}
        aria-label={ariaLabel || `${crawlerSafeLabel} link`}
      >
        {children || (
          <div className='flex items-center gap-2'>
            <SocialIcon platform={platform} size={20} />
            <span>{crawlerSafeLabel}</span>
          </div>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={wrappedData.wrappedUrl}
      target={target}
      rel={securityRel}
      className={className}
      aria-label={ariaLabel || `${wrappedData.alias} link`}
      data-link-kind={wrappedData.kind}
    >
      {children || (
        <div className='flex items-center gap-2'>
          <SocialIcon platform={platform} size={20} />
          <span>{wrappedData.alias}</span>
          {wrappedData.kind === 'sensitive' && (
            <span className='text-xs rounded px-1.5 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200'>
              Verification Required
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

/**
 * Simple wrapper for DSP buttons with anti-cloaking protection
 */
interface WrappedDSPButtonProps {
  href: string;
  platform: string;
  className?: string;
  children: ReactNode;
}

export function WrappedDSPButton({
  href,
  platform,
  className = '',
  children,
}: WrappedDSPButtonProps) {
  return (
    <WrappedSocialLink
      href={href}
      platform={platform}
      className={className}
      aria-label={`Listen on ${platform}`}
    >
      {children}
    </WrappedSocialLink>
  );
}

/**
 * Fallback component for unwrapped links (legacy support)
 */
interface LegacySocialLinkProps {
  href: string;
  platform: string;
  children: ReactNode;
  className?: string;
}

export function LegacySocialLink({
  href,
  platform,
  children,
  className = '',
}: LegacySocialLinkProps) {
  const domain = extractDomain(href);
  const crawlerSafeLabel = getCrawlerSafeLabel(domain, platform);

  return (
    <Link
      href={href}
      target='_blank'
      rel='noreferrer noopener ugc nofollow'
      className={className}
      aria-label={`${crawlerSafeLabel} link`}
    >
      {children}
    </Link>
  );
}
