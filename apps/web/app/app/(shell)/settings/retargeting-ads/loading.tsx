import {
  InputSkeleton,
  SettingsButtonSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

/**
 * Retargeting ads settings loading skeleton.
 */
export default function RetargetingAdsLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-56' descriptionWidth='w-96'>
      <InputSkeleton />
      <InputSkeleton />
      <SettingsButtonSkeleton />
    </SettingsLoadingSkeleton>
  );
}
