import {
  InputSkeleton,
  SettingsButtonSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

/**
 * Audience settings loading screen — skeleton matching audience page layout.
 */
export default function SettingsAudienceLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-48' descriptionWidth='w-80'>
      <InputSkeleton />
      <InputSkeleton />
      <SettingsButtonSkeleton width='w-40' />
    </SettingsLoadingSkeleton>
  );
}
