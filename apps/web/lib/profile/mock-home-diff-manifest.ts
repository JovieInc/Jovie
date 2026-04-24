export interface ProfileMockCropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ProfileMockDiffCrop {
  readonly id: string;
  readonly label: string;
  readonly threshold: number;
  readonly rect: ProfileMockCropRect;
}

export interface ProfileMockApprovalCapture {
  readonly id: string;
  readonly route: string;
  readonly selector: string;
}

export const PROFILE_MOCK_HOME_REVIEW_ROUTE =
  '/demo/showcase/tim-white-profile?state=mock-home&capture=reference';

export const PROFILE_MOCK_HOME_CAPTURE_SELECTOR =
  '[data-testid="homepage-phone-state-mock-home"]';

export const PROFILE_MOCK_HOME_DIFF_CROPS: readonly ProfileMockDiffCrop[] = [
  {
    id: 'top-chrome',
    label: 'Top Chrome',
    threshold: 0.03,
    rect: { x: 0.03, y: 0.02, width: 0.94, height: 0.16 },
  },
  {
    id: 'hero-identity',
    label: 'Hero Identity',
    threshold: 0.03,
    rect: { x: 0.03, y: 0.29, width: 0.8, height: 0.27 },
  },
  {
    id: 'hero-cta',
    label: 'Hero CTA',
    threshold: 0.03,
    rect: { x: 0.05, y: 0.53, width: 0.56, height: 0.09 },
  },
  {
    id: 'social-row',
    label: 'Social Row',
    threshold: 0.03,
    rect: { x: 0.62, y: 0.52, width: 0.28, height: 0.11 },
  },
  {
    id: 'primary-release-card',
    label: 'Primary Release Card',
    threshold: 0.05,
    rect: { x: 0.05, y: 0.63, width: 0.67, height: 0.19 },
  },
  {
    id: 'secondary-card-peek',
    label: 'Secondary Card Peek',
    threshold: 0.05,
    rect: { x: 0.73, y: 0.63, width: 0.22, height: 0.19 },
  },
  {
    id: 'pagination-dots',
    label: 'Pagination Dots',
    threshold: 0.03,
    rect: { x: 0.43, y: 0.82, width: 0.15, height: 0.05 },
  },
  {
    id: 'bottom-nav',
    label: 'Bottom Nav',
    threshold: 0.03,
    rect: { x: 0.02, y: 0.88, width: 0.96, height: 0.12 },
  },
  {
    id: 'full-shell',
    label: 'Full Shell',
    threshold: 0.08,
    rect: { x: 0, y: 0, width: 1, height: 1 },
  },
] as const;

export const PROFILE_MOCK_HOME_APPROVAL_CAPTURES: readonly ProfileMockApprovalCapture[] =
  [
    {
      id: 'music',
      route: '/demo/showcase/tim-white-profile?mode=listen',
      selector: '[data-testid="profile-compact-shell"]',
    },
    {
      id: 'events',
      route: '/demo/showcase/tim-white-profile?mode=tour',
      selector: '[data-testid="profile-compact-shell"]',
    },
    {
      id: 'alerts',
      route: '/demo/showcase/tim-white-profile?mode=subscribe',
      selector: '[data-testid="profile-compact-shell"]',
    },
    {
      id: 'profile',
      route: '/demo/showcase/tim-white-profile?mode=about',
      selector: '[data-testid="profile-compact-shell"]',
    },
  ] as const;
