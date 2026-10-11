import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import type { EmailSignatureInput } from '@/lib/email-signature/build-signature';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';

const signatureDialogInput = vi.fn();

vi.mock('@/features/dashboard/molecules/EmailSignatureDialog', () => ({
  EmailSignatureDialog: ({ input }: { input: EmailSignatureInput | null }) => {
    signatureDialogInput(input);
    return null;
  },
}));

vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/app/ov/people',
  useSearchParams: () => new URLSearchParams(),
}));

function profile(id: string, name: string): AdminCreatorProfileRow {
  return {
    id,
    username: id,
    usernameNormalized: id,
    displayName: name,
    avatarUrl: null,
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    location: null,
    hometown: null,
    activeSinceYear: null,
    isClaimed: false,
    claimToken: null,
    claimTokenExpiresAt: null,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    confidence: 0,
    ingestionStatus: 'idle',
    lastIngestionError: null,
    socialLinks: [],
  };
}
const ari = profile('ari', 'Ari Lane');
const sam = profile('sam', 'Sam Rivers');

function view(
  client: QueryClient,
  search: string,
  rows: AdminCreatorProfileRow[]
) {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RightPanelProvider>
          <AdminCreatorProfilesUnified
            profiles={rows}
            page={1}
            pageSize={25}
            total={rows.length}
            search={search}
            sort='created_desc'
          />
        </RightPanelProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('creator query isolation', () => {
  it.each([false, true])(
    'restores unfiltered rows after a searched view (remount=%s)',
    async remount => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      let rendered = render(view(client, 'ari', [ari]));
      expect(await screen.findByText('Ari Lane')).toBeVisible();
      expect(screen.queryByText('Sam Rivers')).toBeNull();
      if (remount) {
        rendered.unmount();
        rendered = render(view(client, '', [ari, sam]));
      } else {
        rendered.rerender(view(client, '', [ari, sam]));
      }
      expect(await screen.findByText('Sam Rivers')).toBeVisible();
      expect(screen.getByText(/Showing 1–2 of 2 profiles/)).toBeVisible();
      rendered.rerender(view(client, 'ari', [ari]));
      expect(await screen.findByText('Ari Lane')).toBeVisible();
      expect(screen.queryByText('Sam Rivers')).toBeNull();
      expect(screen.getByText(/Showing 1–1 of 1 profiles/)).toBeVisible();
      client.clear();
    }
  );
});

describe('email signature dialog', () => {
  it('passes each social link platform into the signature input', async () => {
    const user = userEvent.setup({ delay: null });
    const withSocial: AdminCreatorProfileRow = {
      ...ari,
      socialLinks: [
        {
          id: 'link-1',
          platform: 'instagram',
          platformType: 'social',
          url: 'https://instagram.com/ari',
          displayText: null,
        },
      ],
    };
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(view(client, '', [withSocial]));

    await user.click(
      await screen.findByRole('button', { name: 'More actions' })
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Email Signature…' })
    );

    expect(await screen.findByText('Ari Lane')).toBeVisible();
    const inputs = signatureDialogInput.mock.calls.map(([input]) => input);
    const latest = inputs.at(-1);
    expect(latest?.socials).toEqual([
      {
        label: 'instagram',
        url: 'https://instagram.com/ari',
        platform: 'instagram',
      },
    ]);
    client.clear();
  });
});
