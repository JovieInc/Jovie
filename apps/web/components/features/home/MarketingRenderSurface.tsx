import type { ReactNode } from 'react';
import { HomeNotificationCard } from './HomeNotificationCard';
import {
  HomeProfileShowcase,
  type HomeProfileShowcasePresentation,
} from './HomeProfileShowcase';
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
      className={`relative flex min-h-[13.25rem] items-center justify-center overflow-hidden rounded-[1.4rem] ${
        emphasize
          ? 'bg-[radial-gradient(circle_at_top,rgba(138,180,255,0.14),transparent_50%),linear-gradient(180deg,rgba(13,15,20,0.96),rgba(8,10,14,0.98))]'
          : 'bg-[linear-gradient(180deg,rgba(13,15,20,0.98),rgba(8,10,14,1))]'
      } p-3`}
    >
      {children}
    </div>
  );
}

function ShowcaseCrop({
  stateId,
  presentation = 'featured-card-crop',
  cropAnchor = 'center',
  hideChrome,
}: Readonly<{
  stateId:
    | 'catalog'
    | 'streams-latest'
    | 'streams-presave'
    | 'tour'
    | 'tips-open';
  presentation?: HomeProfileShowcasePresentation;
  cropAnchor?: 'center' | 'left' | 'right' | 'bottom';
  hideChrome: boolean;
}>) {
  return (
    <HomeProfileShowcase
      stateId={stateId}
      presentation={presentation}
      cropAnchor={cropAnchor}
      overlayMode='hidden'
      hideJovieBranding={hideChrome}
      hideMoreMenu={hideChrome}
      className='w-full'
    />
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
          <div className='w-full max-w-[24rem]'>
            <ShowcaseCrop stateId='streams-latest' hideChrome={hideChrome} />
          </div>
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
          <div className='w-full max-w-[24rem]'>
            <HomeProfileShowcase
              stateId='tips-apple-pay'
              presentation='drawer-crop'
              cropAnchor='bottom'
              overlayMode='hidden'
              hideJovieBranding={hideChrome}
              hideMoreMenu={hideChrome}
              className='w-full'
            />
          </div>
        </RenderShell>
      );
    case 'countdown':
      return (
        <RenderShell>
          <div className='grid w-full max-w-[24rem] gap-3'>
            <ShowcaseCrop stateId='streams-presave' hideChrome={hideChrome} />
            <ShowcaseCrop stateId='streams-latest' hideChrome={hideChrome} />
          </div>
        </RenderShell>
      );
    case 'fans':
      return (
        <RenderShell>
          <div className='w-full max-w-[24rem] rounded-[1.25rem] bg-white/[0.03] p-3'>
            <HomeRelationshipPanel />
          </div>
        </RenderShell>
      );
    case 'tour':
      return (
        <RenderShell>
          <div className='w-full max-w-[24rem]'>
            <ShowcaseCrop stateId='tour' hideChrome={hideChrome} />
          </div>
        </RenderShell>
      );
  }
}
