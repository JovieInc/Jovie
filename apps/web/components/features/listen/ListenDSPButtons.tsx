// Legacy component - use ListenSection from organisms instead
import { ListenSection } from '@/components/organisms/ListenSection';
import type { AvailableDSP } from '@/lib/dsp';

type ListenDSPButtonsProps = {
  readonly handle: string;
  readonly dsps: AvailableDSP[];
  readonly initialPreferredUrl?: string | null;
};

export function ListenDSPButtons({
  handle,
  dsps,
  initialPreferredUrl,
}: ListenDSPButtonsProps) {
  return (
    <ListenSection
      handle={handle}
      dsps={dsps}
      initialPreferredUrl={initialPreferredUrl}
      size='md'
      showPreferenceNotice={true}
      savePreferences={true}
      enableDeepLinks={true}
      enableTracking={true}
    />
  );
}
