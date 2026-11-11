import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsAppearanceSection } from '@/features/dashboard/organisms/SettingsAppearanceSection';

const setThemeMock = vi.fn();
const updateThemeMock = vi.fn();
const setHighContrastMock = vi.fn();
const saveHighContrastMock = vi.fn();

const themeState: {
  theme: string;
  resolvedTheme: string;
  forcedTheme: string | undefined;
  systemTheme: string | undefined;
} = {
  theme: 'system',
  resolvedTheme: 'dark',
  forcedTheme: undefined,
  systemTheme: 'dark',
};
const dashboardState: { selectedProfile: { id: string } | null } = {
  selectedProfile: { id: 'selected-profile-id' },
};

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: themeState.theme,
    resolvedTheme: themeState.resolvedTheme,
    forcedTheme: themeState.forcedTheme,
    systemTheme: themeState.systemTheme,
    setTheme: setThemeMock,
  }),
}));

vi.mock('@/lib/hooks/useHighContrast', () => ({
  useHighContrast: () => ({
    isHighContrast: false,
    setHighContrast: setHighContrastMock,
  }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => dashboardState,
}));

vi.mock('@/lib/queries', () => ({
  useThemeMutation: () => ({
    updateTheme: updateThemeMock,
    isPending: false,
  }),
  useHighContrastMutation: () => ({
    setHighContrast: saveHighContrastMock,
    isPending: false,
  }),
}));

describe('SettingsAppearanceSection', () => {
  const renderSection = () =>
    render(
      <TooltipProvider>
        <SettingsAppearanceSection />
      </TooltipProvider>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    themeState.theme = 'system';
    themeState.resolvedTheme = 'dark';
    themeState.forcedTheme = undefined;
    themeState.systemTheme = 'dark';
    dashboardState.selectedProfile = { id: 'selected-profile-id' };
  });

  it('renders all appearance controls including resolved system value', () => {
    renderSection();

    expect(screen.getByTestId('theme-option-light')).toBeInTheDocument();
    expect(screen.getByTestId('theme-option-dark')).toBeInTheDocument();
    expect(screen.getByTestId('theme-option-system')).toBeInTheDocument();
    expect(screen.getAllByText('Dark').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByLabelText('Toggle high contrast mode')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('theme-option-light').closest('.px-4')
    ).toHaveClass('px-4', 'py-4', 'sm:px-5');
  });

  it('updates persisted theme when an option is selected', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('theme-option-light'));

    expect(setThemeMock).toHaveBeenCalledWith('light');
    expect(updateThemeMock).toHaveBeenCalledWith('light', false);
  });

  it('disables appearance changes without a selected profile', () => {
    dashboardState.selectedProfile = null;
    renderSection();

    const lightTheme = screen.getByTestId('theme-option-light');
    const highContrast = screen.getByLabelText('Toggle high contrast mode');
    expect(lightTheme).toBeDisabled();
    expect(highContrast).toBeDisabled();

    fireEvent.click(lightTheme);
    fireEvent.click(highContrast);

    expect(setThemeMock).not.toHaveBeenCalled();
    expect(updateThemeMock).not.toHaveBeenCalled();
    expect(setHighContrastMock).not.toHaveBeenCalled();
    expect(saveHighContrastMock).not.toHaveBeenCalled();
  });

  it('server-renders no theme selection so hydration matches the client', () => {
    themeState.theme = 'dark';

    const html = renderToString(
      <TooltipProvider>
        <SettingsAppearanceSection />
      </TooltipProvider>
    );

    expect(html).not.toContain('aria-pressed="true"');

    renderSection();
    expect(screen.getByTestId('theme-option-dark')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shows enforced Dark and blocks writes while the theme is forced with a stored Light preference', () => {
    themeState.forcedTheme = 'dark';
    themeState.theme = 'light';
    renderSection();

    expect(screen.getByTestId('theme-option-dark')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('theme-option-light')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByTestId('theme-option-light')).toBeDisabled();
    expect(screen.getByTestId('theme-option-system')).toBeDisabled();

    fireEvent.click(screen.getByTestId('theme-option-light'));
    fireEvent.click(screen.getByTestId('theme-option-system'));
    expect(setThemeMock).not.toHaveBeenCalled();
    expect(updateThemeMock).not.toHaveBeenCalled();
  });

  it('shows enforced Dark and blocks writes while the theme is forced with a stored System preference', () => {
    themeState.forcedTheme = 'dark';
    themeState.theme = 'system';
    renderSection();

    expect(screen.getByTestId('theme-option-dark')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('theme-option-system')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByTestId('theme-option-system')).toBeDisabled();

    fireEvent.click(screen.getByTestId('theme-option-dark'));
    expect(setThemeMock).not.toHaveBeenCalled();
    expect(updateThemeMock).not.toHaveBeenCalled();
  });

  it('reports the device resolution from systemTheme, not the stored preference', () => {
    themeState.theme = 'dark';
    themeState.systemTheme = 'light';
    renderSection();

    expect(screen.getByTestId('theme-option-dark')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // 'Light' appears for the stored-preference option label AND the device
    // resolution label inside the System option.
    expect(screen.getAllByText('Light').length).toBeGreaterThanOrEqual(2);
  });

  it('System follows the OS resolution reported by systemTheme', () => {
    themeState.theme = 'system';
    themeState.systemTheme = 'dark';
    renderSection();

    expect(screen.getByTestId('theme-option-system')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getAllByText('Dark').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the enforced Dark selection in server HTML so hydration matches when forced', () => {
    themeState.forcedTheme = 'dark';
    themeState.theme = 'light';

    const html = renderToString(
      <TooltipProvider>
        <SettingsAppearanceSection />
      </TooltipProvider>
    );

    // forcedTheme is synchronous from the provider, so the enforced selection
    // is safe to render on both the server and the first client render.
    expect(html).toContain('aria-pressed="true"');

    renderSection();
    expect(screen.getByTestId('theme-option-dark')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('hydrates server markup without recoverable errors when the device resolution appears only on the client', async () => {
    // Server snapshot: systemTheme is client-derived and undefined pre-hydration.
    themeState.theme = 'dark';
    themeState.systemTheme = undefined;

    const html = renderToString(
      <TooltipProvider>
        <SettingsAppearanceSection />
      </TooltipProvider>
    );
    expect(html).not.toContain('resolves System to');

    // The device reports Light only after hydration, as next-themes does.
    themeState.systemTheme = 'light';

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;

    const consoleErrors: unknown[][] = [];
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        consoleErrors.push(args);
      });

    try {
      hydrateRoot(
        container,
        <TooltipProvider>
          <SettingsAppearanceSection />
        </TooltipProvider>
      );

      // Post-hydration: the System option reports the real device resolution.
      await waitFor(() => {
        expect(screen.getAllByText('Light').length).toBeGreaterThanOrEqual(2);
      });
      expect(
        consoleErrors.filter(args =>
          args.some(argument =>
            /hydrat|did not match|mismatch/i.test(String(argument))
          )
        )
      ).toEqual([]);
    } finally {
      errorSpy.mockRestore();
      container.remove();
    }
  });

  it('keeps high contrast writable while the theme is forced', () => {
    themeState.forcedTheme = 'dark';
    renderSection();

    const highContrast = screen.getByLabelText('Toggle high contrast mode');
    expect(highContrast).not.toBeDisabled();
    fireEvent.click(highContrast);
    expect(setHighContrastMock).toHaveBeenCalledWith(true);
    expect(saveHighContrastMock).toHaveBeenCalledWith(true, 'system');
  });
});
