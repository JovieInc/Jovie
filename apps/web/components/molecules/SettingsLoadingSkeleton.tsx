/**
 * Reusable loading skeleton for settings pages.
 * Reduces duplication across settings loading.tsx files.
 */

export interface SettingsLoadingSkeletonProps {
  /** Title skeleton width (default: 'w-48') */
  readonly titleWidth?: string;
  /** Description skeleton width (default: 'w-80') */
  readonly descriptionWidth?: string;
  /** Content to render inside the card */
  readonly children: React.ReactNode;
}

/**
 * Base skeleton wrapper for settings sections.
 *
 * @example
 * ```tsx
 * <SettingsLoadingSkeleton titleWidth="w-56" descriptionWidth="w-96">
 *   <InputSkeleton />
 *   <InputSkeleton />
 *   <SettingsButtonSkeleton width="w-40" />
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

/** Skeleton for a button in settings context */
export function SettingsButtonSkeleton({
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

/** Skeleton for a card/panel in settings context */
export function SettingsCardSkeleton({
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
      <SettingsButtonSkeleton width='w-40' />
    </SettingsLoadingSkeleton>
  );
}

/** Billing settings loading skeleton */
export function BillingSettingsLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-64' descriptionWidth='w-96'>
      <SettingsCardSkeleton height='h-20' />
      <SettingsButtonSkeleton width='w-44' />
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

/** Branding settings loading skeleton (used by branding and remove-branding pages) */
export function BrandingSettingsLoading() {
  return (
    <SettingsLoadingSkeleton titleWidth='w-56' descriptionWidth='w-96'>
      <div className='flex items-center justify-between gap-4'>
        <div className='space-y-2'>
          <div className='h-4 w-56 rounded skeleton' />
          <div className='h-4 w-80 rounded skeleton' />
        </div>
        <div className='h-6 w-10 rounded skeleton' />
      </div>
      <SettingsButtonSkeleton width='w-44' />
    </SettingsLoadingSkeleton>
  );
}
