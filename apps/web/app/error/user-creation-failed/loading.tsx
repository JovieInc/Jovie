import { AuthPageSkeleton } from '@/features/auth';

export default function ErrorPageLoading() {
  return (
    <AuthPageSkeleton
      formTitle='Account setup error'
      showFooterPrompt={false}
    />
  );
}
