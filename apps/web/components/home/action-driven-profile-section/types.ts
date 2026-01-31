export type PillarId = 'streams' | 'merch' | 'tickets';

export type PromotedModuleId = 'listen' | 'merch' | 'tickets';

export interface PillarConfig {
  id: PillarId;
  tabLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  fanChip: string;
  metricChip: string;
  actions: readonly string[];
  promotedModuleId: PromotedModuleId;
  accentClassName: string;
}

export interface ProfileArtist {
  name: string;
  handle: string;
  tagline: string;
}

export interface ActionDrivenProfileSectionClientProps {
  readonly pillars: readonly PillarConfig[];
  readonly profileArtist: ProfileArtist;
}

export interface UsePillarTabsReturn {
  activePillarId: PillarId;
  setActivePillarId: (id: PillarId) => void;
  active: PillarConfig | undefined;
  activePillarIndex: number;
  tabRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
  getTabId: (pillarId: PillarId) => string;
  getPanelId: (pillarId: PillarId) => string;
  handleTabKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => void;
}
