import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const handle = TIM_WHITE_PROFILE.publicProfileDisplay;

export const TIM_WHITE_SHARE_DEEP_LINKS = [
  handle,
  `${handle}/pay`,
  `${handle}/listen`,
  `${handle}/contact`,
] as const satisfies readonly [string, string, string, string];
