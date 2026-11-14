import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OperatorBannerWrapper } from './OperatorBannerWrapper';

const operatorBanner = vi.hoisted(() => ({
  enabled: true,
  issues: [] as string[],
}));

vi.mock('@/lib/admin/operator-banner', () => ({
  isOperatorBannerEnvironmentEnabled: () => operatorBanner.enabled,
  getOperatorEnvIssues: () => operatorBanner.issues,
}));
vi.mock('@/lib/env-client', () => ({ env: { IS_E2E: false } }));
vi.mock('@/lib/queries', () => ({
  useEnvHealthQuery: () => ({ data: undefined }),
}));

async function renderWrapper(isAdmin: boolean) {
  const node = await OperatorBannerWrapper({ isAdmin });
  return render(<main>{node}</main>);
}

describe('OperatorBannerWrapper', () => {
  beforeEach(() => {
    sessionStorage.clear();
    operatorBanner.enabled = true;
    operatorBanner.issues = ['DATABASE_URL is not set'];
  });

  it('shows the server-decided issues to admins and lets them dismiss', async () => {
    const { container } = await renderWrapper(true);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'DATABASE_URL is not set'
    );
    await expectNoA11yViolations(container);

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Environment Warning' })
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders nothing for non-admins', async () => {
    const { container } = await renderWrapper(false);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('main')).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when the environment disables the banner', async () => {
    operatorBanner.enabled = false;
    const { container } = await renderWrapper(true);
    expect(container.querySelector('main')).toBeEmptyDOMElement();
  });

  it('renders nothing when the server finds no issues', async () => {
    operatorBanner.issues = [];
    const { container } = await renderWrapper(true);
    expect(container.querySelector('main')).toBeEmptyDOMElement();
  });
});
