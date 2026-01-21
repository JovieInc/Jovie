import { useMemo } from 'react';

/**
 * Reusable loading skeleton for settings pages.
 * Reduces duplication across settings loading.tsx files.
 */

export interface SettingsLoadingSkeletonProps {
  /** Title skeleton width (default: 'w-48') */
  titleWidth?: string;
  /** Description skeleton width (default: 'w-80') */
  descriptionWidth?: string;
  /** Content to render inside the card */
  children: React.ReactNode;
}

/**
 * Base skeleton wrapper for settings sections.
 *
 * @example
 * ```tsx
 * <SettingsLoadingSkeleton titleWidth="w-56" descriptionWidth="w-96">
 *   <InputSkeleton />
 *   <InputSkeleton />
 *   <ButtonSkeleton width="w-40" />
 * </SettingsLoadingSkeleton>
 * ```
 */
export function SettingsLoadingSkeleton({
  titleWidth = 'w-48',
  descriptionWidth = 'w-80',
  children,
}: Readonly<SettingsLoadingSkeletonProps>) {
  return (
    <div className='mx-auto max-w-2xl'>
      <div className='space-y-8 pb-8'>
        <section className='scroll-mt-4'>
          <div className='mb-6 space-y-2'>
            <div className={`h-8 ${titleWidth} rounded skeleton`} />
            <div className={`h-4 ${descriptionWidth} rounded skeleton`} />
          </div>
          <div className='rounded-2xl bg-surface-1/40 p-6 shadow-none space-y-4'>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Skeleton for a single input field */
export function InputSkeleton({
  width = 'w-full',
}: Readonly<{ width?: string }>) {
  return <div className={`h-10 ${width} rounded skeleton`} />;
}

/** Skeleton for a button */
export function ButtonSkeleton({
  width = 'w-40',
}: Readonly<{ width?: string }>) {
  return <div className={`h-10 ${width} rounded skeleton`} />;
}

/** Skeleton for a toggle row (label + switch) */
export function ToggleRowSkeleton({
  labelWidth = 'w-56',
}: Readonly<{
  labelWidth?: string;
}>) {
  return (
    <div className='flex items-center justify-between gap-4'>
      <div className={`h-4 ${labelWidth} rounded skeleton`} />
      <div className='h-6 w-10 rounded skeleton' />
    </div>
  );
}

/** Skeleton for a card/panel */
export function CardSkeleton({
  height = 'h-20',
  width = 'w-full',
}: Readonly<{
  height?: string;
  width?: string;
}>) {
  return <div className={`${height} ${width} rounded-xl skeleton`} />;
}

// ============================================================================
// Pre-composed skeletons for common settings pages
// ============================================================================

/** Profile settings loading skeleton */
export function ProfileSettingsLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-48' descriptionWidth='w-80'>
      <InputSkeleton />
      <InputSkeleton />
      <ButtonSkeleton width='w-40' />
    </SettingsLoadingSkeleton>
  );
}

/** Billing settings loading skeleton */
export function BillingSettingsLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-64' descriptionWidth='w-96'>
      <CardSkeleton height='h-20' />
      <ButtonSkeleton width='w-44' />
    </SettingsLoadingSkeleton>
  );
}

/** Notifications settings loading skeleton */
export function NotificationsSettingsLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-56' descriptionWidth='w-96'>
      <ToggleRowSkeleton labelWidth='w-56' />
      <ToggleRowSkeleton labelWidth='w-64' />
      <ToggleRowSkeleton labelWidth='w-48' />
    </SettingsLoadingSkeleton>
  );
}

/** Appearance settings loading skeleton */
export function AppearanceSettingsLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-48' descriptionWidth='w-80'>
      <InputSkeleton />
      <InputSkeleton />
      <ButtonSkeleton width='w-40' />
    </SettingsLoadingSkeleton>
  );
}

/** Generic form settings loading skeleton */
export function FormSettingsLoading({
  inputCount = 3,
}: Readonly<{
  inputCount?: number;
}>) {
  const inputKeys = useMemo(
    () => Array.from({ length: inputCount }, (_, i) => `form-input-${i}`),
    [inputCount]
  );

  return (
    <SettingsLoadingSkeleton>
      {inputKeys.map(key => (
        <InputSkeleton key={key} />
      ))}
      <ButtonSkeleton />
    </SettingsLoadingSkeleton>
  );
}
