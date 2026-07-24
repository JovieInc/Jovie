import {
  InputSkeleton,
  SettingsButtonSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

/**
 * Settings loading screen — generic skeleton matching settings page layout.
 */
export default function SettingsLoading() {
  return (
    <SettingsLoadingSkeleton>
      <InputSkeleton />
      <InputSkeleton />
      <InputSkeleton />
      <SettingsButtonSkeleton />
    </SettingsLoadingSkeleton>
  );
}
