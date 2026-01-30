import {
  InputSkeleton,
  SettingsButtonSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

export default function SettingsAccountLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-56' descriptionWidth='w-96'>
      <InputSkeleton />
      <InputSkeleton />
      <SettingsButtonSkeleton width='w-40' />
    </SettingsLoadingSkeleton>
  );
}
