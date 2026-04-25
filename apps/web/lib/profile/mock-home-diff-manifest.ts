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
  readonly label: string;
  readonly route: string;
  readonly selector: string;
  readonly threshold: number;
  readonly targetRect: ProfileMockCropRect;
  readonly currentRect: ProfileMockCropRect;
}

export const PROFILE_MOCK_HOME_APPROVAL_CAPTURES: readonly ProfileMockApprovalCapture[] =
  [
    {
      id: 'releases',
      label: 'Releases Drawer',
      route: '/demo/showcase/tim-white-profile?mode=listen',
      selector: '[data-testid="profile-compact-shell"]',
      threshold: 0.12,
      targetRect: { x: 1 / 3, y: 0.36, width: 1 / 3, height: 0.64 },
      currentRect: { x: 0, y: 0.36, width: 1, height: 0.64 },
    },
    {
      id: 'payments',
      label: 'Payments Drawer',
      route: '/demo/showcase/tim-white-profile?mode=pay',
      selector: '[data-testid="profile-compact-shell"]',
      threshold: 0.12,
      targetRect: { x: 2 / 3, y: 0.36, width: 1 / 3, height: 0.64 },
      currentRect: { x: 0, y: 0.36, width: 1, height: 0.64 },
    },
    {
      id: 'tour',
      label: 'Tour Drawer',
      route: '/demo/showcase/tim-white-profile?mode=tour',
      selector: '[data-testid="profile-compact-shell"]',
      threshold: 0.12,
      targetRect: { x: 0, y: 0.36, width: 1 / 3, height: 0.64 },
      currentRect: { x: 0, y: 0.36, width: 1, height: 0.64 },
    },
  ] as const;
