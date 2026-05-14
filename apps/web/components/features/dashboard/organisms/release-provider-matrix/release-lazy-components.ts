import { lazy } from 'react';

export const AddReleaseSidebar = lazy(() =>
  import('./AddReleaseSidebar').then(m => ({
    default: m.AddReleaseSidebar,
  }))
);

export const ReleaseSidebar = lazy(() =>
  import('@/components/organisms/release-sidebar').then(m => ({
    default: m.ReleaseSidebar,
  }))
);

export const TrackSidebar = lazy(() =>
  import('@/components/organisms/release-sidebar').then(m => ({
    default: m.TrackSidebar,
  }))
);

export const SpotifyConnectDialog = lazy(() =>
  import('./SpotifyConnectDialog').then(m => ({
    default: m.SpotifyConnectDialog,
  }))
);

export const ArtistSearchCommandPalette = lazy(() =>
  import('@/components/organisms/artist-search-palette').then(m => ({
    default: m.ArtistSearchCommandPalette,
  }))
);

export const ReleasesEmptyState = lazy(() =>
  import('./ReleasesEmptyState').then(m => ({
    default: m.ReleasesEmptyState,
  }))
);

export const ReleasePlanWizard = lazy(() =>
  import('./ReleasePlanWizard').then(m => ({
    default: m.ReleasePlanWizard,
  }))
);
