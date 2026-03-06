import {
  SettingsLoadingSkeleton,
  ToggleRowSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

/**
 * Appearance settings loading skeleton.
 */
export default function AppearanceLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-48' descriptionWidth='w-80'>
      <ToggleRowSkeleton labelWidth='w-56' />
      <ToggleRowSkeleton labelWidth='w-48' />
    </SettingsLoadingSkeleton>
  );
}
