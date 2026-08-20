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
