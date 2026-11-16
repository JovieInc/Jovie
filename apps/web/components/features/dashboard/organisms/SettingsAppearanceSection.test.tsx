import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  setTheme: vi.fn(),
  updateTheme: vi.fn(),
  setHighContrast: vi.fn(),
  saveHighContrast: vi.fn(),
  theme: {
    theme: 'system' as string,
    forcedTheme: undefined as string | undefined,
    systemTheme: 'dark' as string | undefined,
  },
  dashboard: {
    selectedProfile: { id: 'profile-1' } as { id: string } | null,
  },
  pending: { theme: false, contrast: false },
  isHighContrast: false,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ ...mocks.theme, setTheme: mocks.setTheme }),
}));
vi.mock('@/lib/hooks/useHighContrast', () => ({
  useHighContrast: () => ({
    isHighContrast: mocks.isHighContrast,
    setHighContrast: mocks.setHighContrast,
  }),
}));
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => mocks.dashboard,
}));
vi.mock('@/lib/queries', () => ({
  useThemeMutation: () => ({
    updateTheme: mocks.updateTheme,
    isPending: mocks.pending.theme,
  }),
  useHighContrastMutation: () => ({
    setHighContrast: mocks.saveHighContrast,
    isPending: mocks.pending.contrast,
  }),
}));

import { SettingsAppearanceSection } from './SettingsAppearanceSection';

function renderSection(dir?: 'rtl') {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <SettingsAppearanceSection />
      </div>
    </TooltipProvider>
  );
}

const option = (name: 'light' | 'dark' | 'system') =>
  screen.getByTestId(`theme-option-${name}`);
const contrastToggle = () =>
  screen.getByRole('switch', { name: 'High Contrast' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.theme.theme = 'system';
  mocks.theme.forcedTheme = undefined;
  mocks.theme.systemTheme = 'dark';
  mocks.dashboard.selectedProfile = { id: 'profile-1' };
  mocks.pending.theme = false;
  mocks.pending.contrast = false;
  mocks.isHighContrast = false;
});

describe('SettingsAppearanceSection', () => {
  it('marks the stored theme and saves a new one', async () => {
    const user = userEvent.setup();
    const { container } = renderSection();

    expect(option('system')).toHaveAttribute('aria-pressed', 'true');
    expect(option('dark')).toHaveAttribute('aria-pressed', 'false');
    await expectNoA11yViolations(container);

    await user.click(option('dark'));

    expect(mocks.setTheme).toHaveBeenCalledWith('dark');
    expect(mocks.updateTheme).toHaveBeenCalledWith('dark', false);
  });

  it('turns on high contrast and saves it with the current theme', async () => {
    const user = userEvent.setup();
    mocks.theme.theme = 'light';
    const { container } = renderSection();

    await user.click(contrastToggle());

    expect(mocks.setHighContrast).toHaveBeenCalledWith(true);
    expect(mocks.saveHighContrast).toHaveBeenCalledWith(true, 'light');
    await expectNoA11yViolations(container);
  });

  it('disables the theme options while a theme save is pending', async () => {
    const user = userEvent.setup();
    mocks.pending.theme = true;
    const { container } = renderSection();

    for (const name of ['light', 'dark', 'system'] as const) {
      expect(option(name)).toBeDisabled();
    }
    expect(contrastToggle()).toBeEnabled();
    await user.click(option('light'));
    expect(mocks.updateTheme).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('disables the contrast toggle while a contrast save is pending', async () => {
    mocks.pending.contrast = true;
    const { container } = renderSection();

    expect(contrastToggle()).toBeDisabled();
    expect(option('light')).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('disables every control when no profile is selected', async () => {
    const user = userEvent.setup();
    mocks.dashboard.selectedProfile = null;
    const { container } = renderSection();

    expect(option('dark')).toBeDisabled();
    expect(contrastToggle()).toBeDisabled();
    await user.click(option('dark'));
    await user.click(contrastToggle());
    expect(mocks.updateTheme).not.toHaveBeenCalled();
    expect(mocks.saveHighContrast).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('pins a forced theme and refuses other choices', async () => {
    const user = userEvent.setup();
    mocks.theme.forcedTheme = 'dark';
    const { container } = renderSection();

    expect(option('dark')).toHaveAttribute('aria-pressed', 'true');
    expect(option('light')).toBeDisabled();
    await user.click(option('dark'));
    expect(mocks.setTheme).not.toHaveBeenCalled();
    expect(mocks.updateTheme).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    mocks.isHighContrast = true;
    const { container } = renderSection('rtl');

    expect(contrastToggle()).toHaveAttribute('aria-checked', 'true');
    await expectNoA11yViolations(container);
  });
});
