import type { ReactNode } from 'react';
import { HomeCountdownObject } from './HomeCountdownObject';
import { HomeNotificationCard } from './HomeNotificationCard';
import { HomeProfileShowcase } from './HomeProfileShowcase';
import { HomeRelationshipPanel } from './HomeRelationshipPanel';

export const MARKETING_RENDER_ROUTE_SURFACES = [
  {
    id: 'profile',
    label: 'Profile',
    href: '/renders/surfaces/profile',
  },
  {
    id: 'notification',
    label: 'Notification',
    href: '/renders/surfaces/notification',
  },
  {
    id: 'tips',
    label: 'Tips',
    href: '/renders/surfaces/tips',
  },
  {
    id: 'countdown',
    label: 'Countdown',
    href: '/renders/surfaces/countdown',
  },
  {
    id: 'fans',
    label: 'Fans',
    href: '/renders/surfaces/fans',
  },
] as const;

export type MarketingRenderRouteSurfaceId =
  (typeof MARKETING_RENDER_ROUTE_SURFACES)[number]['id'];

export type MarketingRenderSurfaceId = MarketingRenderRouteSurfaceId | 'tour';

export function isMarketingRenderRouteSurfaceId(
  value: string
): value is MarketingRenderRouteSurfaceId {
  return MARKETING_RENDER_ROUTE_SURFACES.some(surface => surface.id === value);
}

interface MarketingRenderSurfaceProps {
  readonly surfaceId: MarketingRenderSurfaceId;
  readonly hideChrome?: boolean;
}

function RenderShell({
  children,
  emphasize = false,
}: Readonly<{
  children: ReactNode;
  emphasize?: boolean;
}>) {
  return (
    <div
      className={`relative flex min-h-[13rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/10 ${
        emphasize
          ? 'bg-[radial-gradient(circle_at_top,rgba(138,180,255,0.18),transparent_52%),linear-gradient(180deg,rgba(16,19,26,0.98),rgba(6,8,12,1))]'
          : 'bg-[linear-gradient(180deg,rgba(14,16,22,0.98),rgba(7,9,13,1))]'
      } p-4 shadow-[0_22px_56px_rgba(0,0,0,0.22)]`}
    >
      {children}
    </div>
  );
}

export function MarketingRenderSurface({
  surfaceId,
  hideChrome = true,
}: Readonly<MarketingRenderSurfaceProps>) {
  switch (surfaceId) {
    case 'profile':
      return (
        <RenderShell emphasize>
          <HomeProfileShowcase
            stateId='catalog'
            presentation='beauty-shot'
            overlayMode='hidden'
            hideJovieBranding={hideChrome}
            hideMoreMenu={hideChrome}
            className='w-full max-w-[16.25rem]'
          />
        </RenderShell>
      );
    case 'notification':
      return (
        <RenderShell emphasize>
          <div className='w-full max-w-[22rem]'>
            <HomeNotificationCard />
          </div>
        </RenderShell>
      );
    case 'tips':
      return (
        <RenderShell>
          <HomeProfileShowcase
            stateId='tips-apple-pay'
            presentation='drawer-crop'
            cropAnchor='bottom'
            hideJovieBranding={hideChrome}
            hideMoreMenu={hideChrome}
            className='w-full'
          />
        </RenderShell>
      );
    case 'countdown':
      return (
        <RenderShell>
          <div className='flex w-full flex-col items-center gap-4'>
            <HomeCountdownObject />
            <HomeProfileShowcase
              stateId='streams-presave'
              presentation='featured-card-crop'
              overlayMode='hidden'
              hideJovieBranding={hideChrome}
              hideMoreMenu={hideChrome}
              className='w-full'
            />
          </div>
        </RenderShell>
      );
    case 'fans':
      return (
        <RenderShell>
          <div className='w-full max-w-[24rem] rounded-[1.25rem] border border-white/8 bg-white/[0.04] p-3'>
            <HomeRelationshipPanel />
          </div>
        </RenderShell>
      );
    case 'tour':
      return (
        <RenderShell>
          <HomeProfileShowcase
            stateId='tour'
            presentation='featured-card-crop'
            overlayMode='hidden'
            hideJovieBranding={hideChrome}
            hideMoreMenu={hideChrome}
            className='w-full'
          />
        </RenderShell>
      );
  }
}
