import {
  InputSkeleton,
  SettingsButtonSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

/**
 * Artist profile settings loading screen — skeleton matching profile form layout.
 */
export default function SettingsArtistProfileLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-56' descriptionWidth='w-96'>
      <InputSkeleton />
      <InputSkeleton />
      <InputSkeleton />
      <SettingsButtonSkeleton width='w-40' />
    </SettingsLoadingSkeleton>
  );
}
