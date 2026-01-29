import {
  InputSkeleton,
  SettingsLoadingSkeleton,
} from '@/components/molecules/SettingsLoadingSkeleton';

export default function SettingsAppearanceLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-44' descriptionWidth='w-72'>
      <div className='h-4 w-56 rounded skeleton' />
      <InputSkeleton />
      <InputSkeleton />
    </SettingsLoadingSkeleton>
  );
}
