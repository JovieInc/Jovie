import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FinalCTASection } from '@/features/home/FinalCTASection';

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('FinalCTASection', () => {
  it('renders headline', () => {
    renderWithQueryClient(<FinalCTASection />);
    expect(screen.getByTestId('final-cta-headline')).toBeInTheDocument();
  });

  it('renders claim handle form', () => {
    renderWithQueryClient(<FinalCTASection />);
    expect(screen.getByTestId('final-cta-dock')).toBeInTheDocument();
  });
});
