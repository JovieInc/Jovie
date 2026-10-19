import { AuthPageSkeleton } from '@/features/auth';

export default function ErrorPageLoading() {
  return (
    <main id='main-content'>
      <AuthPageSkeleton
        formTitle='Account setup error'
        showFooterPrompt={false}
      />
    </main>
  );
}
