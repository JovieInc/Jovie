/**
 * Anti-Cloaking Safe Social Link Component
 * Wraps external links with crawler-safe labels and proper security headers
 */

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  getCrawlerSafeLabel,
  isSensitiveDomain,
} from '@/lib/utils/domain-categorizer';
import { extractDomain } from '@/lib/utils/url-parsing';

interface WrappedSocialLinkProps {
  href: string;
  platform: string;
  children?: React.ReactNode;
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
  const [isLoading, setIsLoading] = useState(false);

  // Generate crawler-safe label
  const domain = extractDomain(href);
  const _isSensitive = isSensitiveDomain(href); // eslint-disable-line @typescript-eslint/no-unused-vars
  const crawlerSafeLabel = getCrawlerSafeLabel(domain, platform);

  useEffect(() => {
    // Only wrap external links that aren't already wrapped
    if (
      !href ||
      href.startsWith('/') ||
      href.includes(window.location.hostname)
    ) {
      return;
    }

    const controller = new AbortController();

    const wrapLink = async () => {
      setIsLoading(true);

      try {
        const response = await fetch('/api/wrap-link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: href,
            platform,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to wrap link');
        }

        const data = await response.json();
        setWrappedData({
          wrappedUrl:
            data.kind === 'sensitive'
              ? `/out/${data.shortId}`
              : `/go/${data.shortId}`,
          kind: data.kind,
          alias: data.titleAlias || crawlerSafeLabel,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('Link wrapping failed:', err);
        // Fallback to original URL
        setWrappedData({
          wrappedUrl: href,
          kind: 'normal',
          alias: crawlerSafeLabel,
        });
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    wrapLink();

    return () => {
      controller.abort();
    };
  }, [href, platform, crawlerSafeLabel]);

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
            <span className='text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded'>
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
  children: React.ReactNode;
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
  children: React.ReactNode;
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
