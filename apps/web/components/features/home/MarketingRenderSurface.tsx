import type { ReactNode } from 'react';
import { CompactGlassCaptureDemo } from '@/components/marketing/artist-profile/CompactGlassCaptureDemo';
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
  {
    id: 'compact-glass',
    label: 'Compact Glass',
    href: '/renders/surfaces/compact-glass',
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

function RenderShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className='marketing-rounded-frame relative flex min-h-52 items-center justify-center bg-ink-on-media p-3'>
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
        <RenderShell>
          <div className='w-full max-w-96'>
            <ShowcaseCrop stateId='streams-latest' hideChrome={hideChrome} />
          </div>
        </RenderShell>
      );
    case 'notification':
      return (
        <RenderShell>
          <div className='w-full max-w-sm'>
            <HomeNotificationCard />
          </div>
        </RenderShell>
      );
    case 'tips':
      return (
        <RenderShell>
          <div className='w-full max-w-96'>
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
          <div className='grid w-full max-w-96 gap-3'>
            <ShowcaseCrop stateId='streams-presave' hideChrome={hideChrome} />
            <ShowcaseCrop stateId='streams-latest' hideChrome={hideChrome} />
          </div>
        </RenderShell>
      );
    case 'fans':
      return (
        <RenderShell>
          <div className='w-full max-w-96 rounded-2xl bg-on-media/3 p-3'>
            <HomeRelationshipPanel />
          </div>
        </RenderShell>
      );
    case 'compact-glass':
      return (
        <RenderShell>
          <div className='w-full max-w-96'>
            <CompactGlassCaptureDemo />
          </div>
        </RenderShell>
      );
    case 'tour':
      return (
        <RenderShell>
          <div className='w-full max-w-96'>
            <ShowcaseCrop stateId='tour' hideChrome={hideChrome} />
          </div>
        </RenderShell>
      );
  }
}
