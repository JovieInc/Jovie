export interface MobileProfileViewport {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly devices: readonly string[];
}

export const MOBILE_PROFILE_VIEWPORTS = [
  {
    id: 'iphone-se-2-3',
    label: 'iPhone SE 2/3',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    devices: ['iPhone SE 2', 'iPhone SE 3'],
  },
  {
    id: 'iphone-13-mini',
    label: 'iPhone 13 Mini',
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    devices: ['iPhone 13 Mini'],
  },
  {
    id: 'iphone-13-14',
    label: 'iPhone 13/14',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    devices: ['iPhone 13', 'iPhone 13 Pro', 'iPhone 14'],
  },
  {
    id: 'iphone-14-pro-15',
    label: 'iPhone 14 Pro/15',
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    devices: ['iPhone 14 Pro', 'iPhone 15', 'iPhone 15 Pro'],
  },
  {
    id: 'iphone-16-pro-17',
    label: 'iPhone 16 Pro/17',
    width: 402,
    height: 874,
    deviceScaleFactor: 3,
    devices: ['iPhone 16 Pro', 'iPhone 17', 'iPhone 17 Pro'],
  },
  {
    id: 'iphone-13-pro-max',
    label: 'iPhone 13 Pro Max/14 Plus',
    width: 428,
    height: 926,
    deviceScaleFactor: 3,
    devices: ['iPhone 13 Pro Max', 'iPhone 14 Plus'],
  },
  {
    id: 'iphone-15-16-plus-max',
    label: 'iPhone 15/16 Plus Max',
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    devices: [
      'iPhone 14 Pro Max',
      'iPhone 15 Plus',
      'iPhone 15 Pro Max',
      'iPhone 16 Plus',
    ],
  },
  {
    id: 'iphone-16-17-pro-max',
    label: 'iPhone 16/17 Pro Max',
    width: 440,
    height: 956,
    deviceScaleFactor: 3,
    devices: ['iPhone 16 Pro Max', 'iPhone 17 Pro Max'],
  },
] as const satisfies readonly MobileProfileViewport[];

export const MOBILE_PROFILE_SCREENSHOT_VIEWPORTS = MOBILE_PROFILE_VIEWPORTS;
