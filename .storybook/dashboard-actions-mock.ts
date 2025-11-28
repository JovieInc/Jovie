// Mock for dashboard actions that provides types but no server-side functionality

export type DashboardData = {
  user: any;
  creatorProfile: any;
  socialLinks: any[];
  totalClicks: number;
  recentClicks: any[];
  analytics: any;
};

export type ProfileSocialLink = {
  id: string;
  platform: string;
  url: string;
  displayName?: string;
  order: number;
};

// Mock functions that don't do anything in Storybook
export const updateCreatorProfile = async (...args: any[]) => {
  return Promise.resolve();
};

export const updateSocialLinks = async (...args: any[]) => {
  return Promise.resolve();
};

// Add any other exports that might be needed
export default {
  updateCreatorProfile,
  updateSocialLinks,
};
