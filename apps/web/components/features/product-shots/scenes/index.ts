import type { ComponentType } from 'react';

export interface SceneDefinition {
  id: string;
  label: string;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
  Component: ComponentType;
}

import { SceneArtistProfile } from './SceneArtistProfile';
import { ScenePricing } from './ScenePricing';
import { SceneReleasesContent } from './SceneReleasesContent';
import { SceneReleasesTable } from './SceneReleasesTable';

export const SCENES: SceneDefinition[] = [
  {
    id: 'releases-table',
    label: 'Releases (Full)',
    description: 'Dashboard with sidebar + releases table',
    defaultWidth: 1440,
    defaultHeight: 900,
    Component: SceneReleasesTable,
  },
  {
    id: 'releases-content',
    label: 'Releases (Content)',
    description: 'Releases table only, no sidebar',
    defaultWidth: 1200,
    defaultHeight: 800,
    Component: SceneReleasesContent,
  },
  {
    id: 'artist-profile',
    label: 'Artist Profile',
    description: 'Public artist profile page',
    defaultWidth: 430,
    defaultHeight: 932,
    Component: SceneArtistProfile,
  },
  {
    id: 'pricing',
    label: 'Pricing',
    description: 'Pricing comparison chart',
    defaultWidth: 1200,
    defaultHeight: 800,
    Component: ScenePricing,
  },
];
