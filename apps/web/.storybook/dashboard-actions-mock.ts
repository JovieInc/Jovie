// Mock for dashboard actions that provides types but no server-side functionality

export type DashboardData = {
  user: { id: string } | null;
  creatorProfiles: unknown[];
  selectedProfile: unknown | null;
  needsOnboarding: boolean;
  sidebarCollapsed: boolean;
  hasSocialLinks: boolean;
  hasMusicLinks: boolean;
  isAdmin: boolean;
  tippingStats: Record<string, unknown>;
  profileCompletion: {
    percentage: number;
    steps: unknown[];
  };
};

export type ProfileSocialLink = {
  id: string;
  platform: string;
  url: string;
  displayName?: string;
  order: number;
};

const emptyDashboardData = (): DashboardData => ({
  user: { id: 'storybook-user' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {},
  profileCompletion: { percentage: 0, steps: [] },
});

export const getDashboardDataEssential = async (): Promise<DashboardData> =>
  emptyDashboardData();

export const getDashboardData = async (): Promise<DashboardData> =>
  emptyDashboardData();

export const getDashboardShellData = async (): Promise<DashboardData> =>
  emptyDashboardData();

export const updateCreatorProfile = async (..._args: unknown[]) =>
  Promise.resolve();

export const updateSocialLinks = async (..._args: unknown[]) =>
  Promise.resolve();

export const updateAllowProfilePhotoDownloads = async (..._args: unknown[]) =>
  Promise.resolve();

export const updateShowOldReleases = async (..._args: unknown[]) =>
  Promise.resolve();

export default {
  getDashboardDataEssential,
  getDashboardData,
  updateCreatorProfile,
  updateSocialLinks,
};
