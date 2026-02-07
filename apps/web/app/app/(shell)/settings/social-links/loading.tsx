import {
  InputSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

export default function SettingsSocialLinksLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-40' descriptionWidth='w-64'>
      <InputSkeleton />
      <InputSkeleton />
      <InputSkeleton />
    </SettingsLoadingSkeleton>
  );
}
