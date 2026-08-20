import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resolveContactsWorkspaceTab } from '@/app/app/(shell)/contacts/contacts-workspace';
import { AudienceTableLoadingShell } from '@/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell';

const WEB_ROOT = join(__dirname, '../../..');

describe('Audience workspace evals on the Contacts page', () => {
  it('resolves the Audience tab from the shipped contacts workspace helper', () => {
    expect(resolveContactsWorkspaceTab('audience')).toBe('audience');
  });

  it('renders the shipped Audience loading shell instead of a blank workspace', () => {
    render(<AudienceTableLoadingShell />);

    expect(screen.getByTestId('dashboard-audience-loading')).toBeVisible();
    expect(screen.getByLabelText('Loading Audience')).toBeVisible();
    expect(screen.getByTestId('audience-ai-visibility-strip')).toHaveClass(
      'shrink-0',
      'border-b',
      'px-4',
      'py-2'
    );
    expect(screen.getByTestId('ai-crawler-card-skeleton')).toHaveClass(
      'min-h-12'
    );
    expect(screen.getByTestId('audience-table-scroll-region')).toHaveClass(
      'flex-1',
      'min-h-0',
      'overflow-hidden'
    );
    const region = screen.getByTestId('audience-table-scroll-region');
    expect(region.children[0]).toHaveClass('overflow-auto', 'md:hidden');
    expect(region.children[1]).toHaveClass('max-md:hidden', 'h-full');
  });

  it('keeps the Contacts page Audience tab on the shared audience client', () => {
    const page = readFileSync(
      join(WEB_ROOT, 'app/app/(shell)/contacts/page.tsx'),
      'utf8'
    );
    expect(page).toContain('LazyDashboardAudienceClient');
    expect(page).toContain('AudienceTableLoadingShell');
    expect(page).toContain("tab', 'audience'");
  });
});
