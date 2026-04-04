import {
  InputSkeleton,
  SettingsButtonSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

export default function SettingsAdPixelsLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-40' descriptionWidth='w-96'>
      <InputSkeleton />
      <InputSkeleton />
      <InputSkeleton />
      <InputSkeleton />
      <SettingsButtonSkeleton width='w-40' />
    </SettingsLoadingSkeleton>
  );
}
