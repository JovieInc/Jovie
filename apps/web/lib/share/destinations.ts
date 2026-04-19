'use client';

import { copyToClipboard } from '@/hooks/useClipboard';
import {
  buildMailtoHref,
  buildPublicShareFallbackText,
  buildTrackedShareUrl,
} from './copy';
import type {
  PublicShareDestination,
  PublicShareDestinationId,
  ShareContext,
  ShareLaunchResult,
} from './types';

async function fetchShareAsset(context: ShareContext): Promise<File | null> {
  try {
    const response = await fetch(context.asset.url, { cache: 'force-cache' });
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    return new File([blob], context.asset.fileName, {
      type: context.asset.mimeType,
    });
  } catch {
    return null;
  }
}

async function downloadAsset(context: ShareContext): Promise<boolean> {
  try {
    const response = await fetch(context.asset.url, { cache: 'force-cache' });
    if (!response.ok) {
      return false;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = context.asset.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    return false;
  }
}

async function openPopup(
  url: string,
  fallbackText?: string
): Promise<ShareLaunchResult> {
  const opened = globalThis.open(url, '_blank', 'noopener,noreferrer');
  if (opened) {
    return { status: 'success' };
  }

  if (fallbackText) {
    const copied = await copyToClipboard(fallbackText);
    return {
      status: 'fallback',
      helperText: copied
        ? 'Pop-up blocked. Share text copied so you can post it manually.'
        : 'Pop-up blocked. Copy the link and post it manually.',
    };
  }

  return {
    status: 'fallback',
    helperText: 'Pop-up blocked. Copy the link and post it manually.',
  };
}

async function launchCopyLink(
  context: ShareContext
): Promise<ShareLaunchResult> {
  const copied = await copyToClipboard(
    buildTrackedShareUrl(context, {
      utm_source: 'share_menu',
      utm_medium: 'share',
      utm_campaign: context.utmContext.releaseSlug ?? 'share',
      utm_content: 'copy_link',
    })
  );

  return copied
    ? { status: 'success' }
    : { status: 'error', helperText: 'Could not copy the link.' };
}

async function launchInstagramStory(
  context: ShareContext,
  destination: PublicShareDestination
): Promise<ShareLaunchResult> {
  const trackedUrl = buildTrackedShareUrl(context, destination.utmParams);
  const copied = await copyToClipboard(trackedUrl);
  const file = await fetchShareAsset(context);

  if (
    file &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: context.title,
        text: context.preparedText,
        url: trackedUrl,
      });
      return { status: 'success' };
    } catch {
      // Fall through to deterministic fallback.
    }
  }

  const downloaded = await downloadAsset(context);
  return {
    status: 'fallback',
    helperText: downloaded
      ? copied
        ? 'Story asset downloaded and link copied. Add it in Instagram Stories.'
        : 'Story asset downloaded. Copy the link manually for your story sticker.'
      : 'Could not prepare the story asset. Try again.',
  };
}

async function launchTwitter(
  context: ShareContext,
  destination: PublicShareDestination
): Promise<ShareLaunchResult> {
  const trackedUrl = buildTrackedShareUrl(context, destination.utmParams);
  const searchParams = new URLSearchParams({
    text: context.preparedText,
    url: trackedUrl,
  });
  return openPopup(
    `https://twitter.com/intent/tweet?${searchParams.toString()}`,
    `${context.preparedText}\n${trackedUrl}`
  );
}

async function launchThreads(
  context: ShareContext,
  destination: PublicShareDestination
): Promise<ShareLaunchResult> {
  const fallbackText = `${context.preparedText}\n${buildTrackedShareUrl(context, destination.utmParams)}`;
  const copied = await copyToClipboard(fallbackText);
  const opened = globalThis.open(
    'https://www.threads.net/',
    '_blank',
    'noopener,noreferrer'
  );

  if (opened) {
    return {
      status: 'fallback',
      helperText: copied
        ? 'Threads text copied. Paste it into your post.'
        : 'Open Threads and paste the copied text manually.',
    };
  }

  return {
    status: 'fallback',
    helperText: copied
      ? 'Threads text copied. Open Threads and paste it into your post.'
      : 'Could not open Threads. Copy the text and post it manually.',
  };
}

async function launchEmail(
  context: ShareContext,
  destination: PublicShareDestination
): Promise<ShareLaunchResult> {
  const trackedUrl = buildTrackedShareUrl(context, destination.utmParams);
  const href = buildMailtoHref({
    subject: context.emailSubject,
    body: `${context.preparedText}\n\n${trackedUrl}`,
  });
  globalThis.location.href = href;
  return { status: 'success' };
}

export const PUBLIC_SHARE_DESTINATIONS: readonly PublicShareDestination[] = [
  {
    id: 'copy_link',
    label: 'Copy Link',
    icon: 'copy',
    supportsPrefill: false,
    supportsFileShare: false,
    utmParams: {
      utm_source: 'share_menu',
      utm_medium: 'share',
      utm_campaign: '{{release_slug}}',
      utm_content: 'copy_link',
    },
    launch: launchCopyLink,
  },
  {
    id: 'instagram_story',
    label: 'Instagram Story',
    icon: 'instagram',
    supportsPrefill: true,
    supportsFileShare: true,
    utmParams: {
      utm_source: 'instagram',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'story',
    },
    launch: context =>
      launchInstagramStory(context, PUBLIC_SHARE_DESTINATIONS[1]),
  },
  {
    id: 'twitter',
    label: 'X / Twitter',
    icon: 'x',
    supportsPrefill: true,
    supportsFileShare: false,
    utmParams: {
      utm_source: 'twitter',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    },
    launch: context => launchTwitter(context, PUBLIC_SHARE_DESTINATIONS[2]),
  },
  {
    id: 'threads',
    label: 'Threads',
    icon: 'threads',
    supportsPrefill: false,
    supportsFileShare: false,
    utmParams: {
      utm_source: 'threads',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    },
    launch: context => launchThreads(context, PUBLIC_SHARE_DESTINATIONS[3]),
  },
  {
    id: 'email',
    label: 'Email',
    icon: 'mail',
    supportsPrefill: true,
    supportsFileShare: false,
    utmParams: {
      utm_source: 'email',
      utm_medium: 'share',
      utm_campaign: '{{release_slug}}',
      utm_content: 'friend',
    },
    launch: context => launchEmail(context, PUBLIC_SHARE_DESTINATIONS[4]),
  },
] as const;

export function getPublicShareDestination(
  destinationId: PublicShareDestinationId
): PublicShareDestination | undefined {
  return PUBLIC_SHARE_DESTINATIONS.find(
    destination => destination.id === destinationId
  );
}

export async function launchPublicShareDestination(
  destinationId: PublicShareDestinationId,
  context: ShareContext
): Promise<ShareLaunchResult> {
  const destination = getPublicShareDestination(destinationId);
  if (!destination) {
    return { status: 'error', helperText: 'Unknown share destination.' };
  }

  try {
    return await destination.launch(context);
  } catch {
    const copied = await copyToClipboard(buildPublicShareFallbackText(context));
    return {
      status: 'fallback',
      helperText: copied
        ? 'Share text copied. Paste it into your post manually.'
        : 'Share failed. Try again.',
    };
  }
}
