import {
  InputSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

export default function SettingsMusicLinksLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-36' descriptionWidth='w-72'>
      <InputSkeleton />
      <InputSkeleton />
      <InputSkeleton />
    </SettingsLoadingSkeleton>
  );
}
