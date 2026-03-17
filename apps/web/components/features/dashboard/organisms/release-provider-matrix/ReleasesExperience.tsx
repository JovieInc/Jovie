'use client';

import { ReleaseProviderMatrix } from './ReleaseProviderMatrix';
import type { ReleaseProviderMatrixProps } from './types';

export interface ReleasesExperienceProps extends ReleaseProviderMatrixProps {}

export function ReleasesExperience(props: ReleasesExperienceProps) {
  return <ReleaseProviderMatrix {...props} />;
}
