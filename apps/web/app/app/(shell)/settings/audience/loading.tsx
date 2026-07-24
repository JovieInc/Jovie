import {
  InputSkeleton,
  SettingsButtonSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

/**
 * Audience settings loading screen — skeleton matching audience page layout.
 * Page renders SettingsAudienceSection + SettingsAdPixelsSection.
 */
export default function SettingsAudienceLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-48' descriptionWidth='w-80'>
      {/* SettingsAudienceSection */}
      <InputSkeleton />
      <InputSkeleton />
      <SettingsButtonSkeleton width='w-40' />

      {/* SettingsAdPixelsSection */}
      <div className='mt-6 space-y-4'>
        <InputSkeleton />
        <InputSkeleton />
        <SettingsButtonSkeleton width='w-40' />
      </div>
    </SettingsLoadingSkeleton>
  );
}
